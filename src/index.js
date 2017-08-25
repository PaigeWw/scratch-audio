const log = require('./log');
const Tone = require('tone');

const PitchEffect = require('./effects/PitchEffect');
const PanEffect = require('./effects/PanEffect');

const SoundPlayer = require('./SoundPlayer');
const ADPCMSoundDecoder = require('./ADPCMSoundDecoder');
const InstrumentPlayer = require('./InstrumentPlayer');
const DrumPlayer = require('./DrumPlayer');

/**
 * @fileOverview Scratch Audio is divided into a single AudioEngine,
 * that handles global functionality, and AudioPlayers, belonging to individual sprites and clones.
 */

class AudioPlayer {
    /**
     * Each sprite or clone has an audio player
     * the audio player handles sound playback, volume, and the sprite-specific audio effects:
     * pitch and pan
     * @param {AudioEngine} audioEngine AudioEngine for player
     * @constructor
     */
    constructor (audioEngine) {
        this.audioEngine = audioEngine;

        // effects setup
        this.pitchEffect = new PitchEffect();
        this.panEffect = new PanEffect();

        // the effects are chained to an effects node for this player, then to the main audio engine
        // audio is sent from each soundplayer, through the effects in order, then to the global effects
        // note that the pitch effect works differently - it sets the playback rate for each soundplayer
        this.effectsNode = new Tone.Gain();
        this.effectsNode.chain(this.panEffect, this.audioEngine.input);

        // reset effects to their default parameters
        this.clearEffects();

        // sound players that are currently playing, indexed by the sound's md5
        this.activeSoundPlayers = {};
    }

    /**
     * Play a sound
     * @param  {string} md5 - the md5 id of a sound file
     * @return {Promise} a Promise that resolves when the sound finishes playing
     */
    playSound (md5) {
        // if this sound is not in the audio engine, return
        if (!this.audioEngine.audioBuffers[md5]) {
            return;
        }

        // if this sprite or clone is already playing this sound, stop it first
        if (this.activeSoundPlayers[md5]) {
            this.activeSoundPlayers[md5].stop();
        }

        // create a new soundplayer to play the sound
        const player = new SoundPlayer();
        player.setBuffer(this.audioEngine.audioBuffers[md5]);
        player.connect(this.effectsNode);
        this.pitchEffect.updatePlayer(player);
        player.start();

        // add it to the list of active sound players
        this.activeSoundPlayers[md5] = player;

        // remove sounds that are not playing from the active sound players array
        for (const id in this.activeSoundPlayers) {
            if (this.activeSoundPlayers.hasOwnProperty(id)) {
                if (!this.activeSoundPlayers[id].isPlaying) {
                    delete this.activeSoundPlayers[id];
                }
            }
        }

        return player.finished();
    }

    /**
     * Play a drum sound. The AudioEngine contains the DrumPlayer, but the AudioPlayer
     * calls this function so that it can pass a reference to its own effects node.
     * @param  {number} drum - a drum number (0-indexed)
     * @param  {number} beats - a duration in beats
     * @return {Promise} a Promise that resolves after the duration has elapsed
     */
    playDrumForBeats (drum, beats) {
        this.audioEngine.drumPlayer.play(drum, this.effectsNode);
        return this.audioEngine.waitForBeats(beats);
    }

    /**
     * Stop all sounds, notes and drums that are playing
     */
    stopAllSounds () {
        // stop all active sound players
        for (const md5 in this.activeSoundPlayers) {
            this.activeSoundPlayers[md5].stop();
        }

        // stop all instruments
        this.audioEngine.instrumentPlayer.stopAll();

        // stop drum notes
        this.audioEngine.drumPlayer.stopAll();
    }

    /**
     * Set an audio effect to a value
     * @param {string} effect - the name of the effect
     * @param {number} value - the value to set the effect to
     */
    setEffect (effect, value) {
        switch (effect) {
        case this.audioEngine.EFFECT_NAMES.pitch:
            this.pitchEffect.set(value, this.activeSoundPlayers);
            break;
        case this.audioEngine.EFFECT_NAMES.pan:
            this.panEffect.set(value);
            break;
        }
    }

    /**
     * Clear all audio effects
     */
    clearEffects () {
        this.panEffect.set(0);
        this.pitchEffect.set(0, this.activeSoundPlayers);
        this.effectsNode.gain.value = 1;
    }

    /**
     * Set the volume for sounds played by this AudioPlayer
     * @param {number} value - the volume in range 0-100
     */
    setVolume (value) {
        this.effectsNode.gain.value = value / 100;
    }
}


/**
 * There is a single instance of the AudioEngine. It handles global audio properties and effects,
 * loads all the audio buffers for sounds belonging to sprites, and creates a single instrument player
 * and a drum player, used by all play note and play drum blocks.
 */
class AudioEngine {
    constructor () {
        this.input = new Tone.Gain();
        this.input.connect(Tone.Master);

        // global tempo in bpm (beats per minute)
        this.currentTempo = 60;

        // instrument player for play note blocks
        this.instrumentPlayer = new InstrumentPlayer(this.input);
        this.numInstruments = this.instrumentPlayer.instrumentNames.length;

        // drum player for play drum blocks
        this.drumPlayer = new DrumPlayer(this.input);
        this.numDrums = this.drumPlayer.drumSounds.length;

        // a map of md5s to audio buffers, holding sounds for all sprites
        this.audioBuffers = {};

        // microphone, for measuring loudness, with a level meter analyzer
        this.mic = null;
        this.micMeter = null;
    }

    /**
     * Names of the audio effects.
     * @enum {string}
     */
    get EFFECT_NAMES () {
        return {
            pitch: 'pitch',
            pan: 'pan'
        };
    }

    /**
     * Decode a sound, decompressing it into audio samples.
     * Store a reference to it the sound in the audioBuffers dictionary, indexed by md5
     * @param  {object} sound - an object containing audio data and metadata for a sound
     * @property {Buffer} data - sound data loaded from scratch-storage.
     * @property {string} format - format type, either empty or adpcm.
     * @property {string} md5 - the MD5 and extension of the sound.
     * @returns {?Promise} - a promise which will resolve after the audio buffer is stored, or null on error.
     */
    decodeSound (sound) {

        console.log('--decodeSound--',sound);
        let loaderPromise = null;

        // Make a copy of the buffer because decoding detaches the original buffer
        var bufferCopy = sound.data.buffer.slice(0);

        switch (sound.format) {
        case '':
            loaderPromise = Tone.context.decodeAudioData(bufferCopy);
            break;
        case 'adpcm':
            loaderPromise = (new ADPCMSoundDecoder()).decode(bufferCopy);
            break;
        default:
            return log.warn('unknown sound format', sound.format);
        }

        const storedContext = this;
        return loaderPromise.then(
            decodedAudio => {
                storedContext.audioBuffers[sound.md5] = new Tone.Buffer(decodedAudio);
            },
            error => {
                log.warn('audio data could not be decoded', error);
            }
        );
    }

    /**
     * An older version of the AudioEngine had this function to load all sounds
     * This is a stub to provide a warning when it is called
     * @todo remove this
     */
    loadSounds () {
        log.warn('The loadSounds function is no longer available. Please use Scratch Storage.');
    }

    /**
     * Play a note for a duration on an instrument with a volume
     * @param  {number} note - a MIDI note number
     * @param  {number} beats - a duration in beats
     * @param  {number} inst - an instrument number (0-indexed)
     * @param  {number} vol - a volume level (0-100%)
     * @return {Promise} a Promise that resolves after the duration has elapsed
     */
    playNoteForBeatsWithInstAndVol (note, beats, inst, vol) {
        const sec = this.beatsToSec(beats);
        this.instrumentPlayer.playNoteForSecWithInstAndVol(note, sec, inst, vol);
        return this.waitForBeats(beats);
    }

    /**
     * Convert a number of beats to a number of seconds, using the current tempo
     * @param  {number} beats number of beats to convert to secs
     * @return {number} seconds number of seconds `beats` will last
     */
    beatsToSec (beats) {
        return (60 / this.currentTempo) * beats;
    }

    /**
     * Wait for some number of beats
     * @param  {number} beats number of beats to wait for
     * @return {Promise} a Promise that resolves after the duration has elapsed
     */
    waitForBeats (beats) {
        const storedContext = this;
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, storedContext.beatsToSec(beats) * 1000);
        });
    }

    /**
     * Set the global tempo in bpm (beats per minute)
     * @param {number} value - the new tempo to set
     */
    setTempo (value) {
        this.currentTempo = value;
    }

    /**
     * Change the tempo by some number of bpm (beats per minute)
     * @param  {number} value - the number of bpm to change the tempo by
     */
    changeTempo (value) {
        this.setTempo(this.currentTempo + value);
    }

    /**
     * Get the current loudness of sound received by the microphone.
     * Sound is measured in RMS and smoothed.
     * @return {number} loudness scaled 0 to 100
     */
    getLoudness () {
        if (!this.mic) {
            this.mic = new Tone.UserMedia();
            this.micMeter = new Tone.Meter('level', 0.5);
            this.mic.open();
            this.mic.connect(this.micMeter);
        }
        if (this.mic && this.mic.state === 'started') {
            return this.micMeter.value * 100;
        }
        return -1;

    }

    /**
     * Create an AudioPlayer. Each sprite or clone has an AudioPlayer.
     * It includes a reference to the AudioEngine so it can use global
     * functionality such as playing notes.
     * @return {AudioPlayer} new AudioPlayer instance
     */
    createPlayer () {
        return new AudioPlayer(this);
    }
}

module.exports = AudioEngine;
