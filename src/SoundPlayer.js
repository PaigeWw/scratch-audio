const Tone = require('tone');
const log = require('./log');

/**
 * A SoundPlayer stores an audio buffer, and plays it
 */
class SoundPlayer {
    constructor () {
        this.outputNode = null;
        this.buffer = new Tone.Buffer();
        this.bufferSource = null;
        this.playbackRate = 1;
        this.isPlaying = false;
    }

    /**
     * Connect the SoundPlayer to an output node
     * @param  {Tone.Gain} node - an output node to connect to
     */
    connect (node) {
        this.outputNode = node;
    }

    /**
     * Set an audio buffer
     * @param {Tone.Buffer} buffer Buffer to set
     */
    setBuffer (buffer) {
        this.buffer = buffer;
    }

    /**
     * Set the playback rate for the sound
     * @param {number} playbackRate - a ratio where 1 is normal playback, 0.5 is half speed, 2 is double speed, etc.
     */
    setPlaybackRate (playbackRate) {
        this.playbackRate = playbackRate;
        if (this.bufferSource && this.bufferSource.playbackRate) {
            this.bufferSource.playbackRate.value = this.playbackRate;
        }
    }

    /**
     * Stop the sound
     */
    stop () {
        if (this.bufferSource) {
            this.bufferSource.stop();
        }
        this.isPlaying = false;
    }

    /**
     * Start playing the sound
     * The web audio framework requires a new audio buffer source node for each playback
     */
    start () {
        if (!this.buffer || !this.buffer.loaded) {
            log.warn('tried to play a sound that was not loaded yet');
            return;
        }

        this.bufferSource = Tone.context.createBufferSource();
        this.bufferSource.buffer = this.buffer.get();
        this.bufferSource.playbackRate.value = this.playbackRate;
        this.bufferSource.connect(this.outputNode);
        this.bufferSource.start();

        this.isPlaying = true;
    }

    /**
     * The sound has finished playing. This is called at the correct time even if the playback rate
     * has been changed
     * @return {Promise} a Promise that resolves when the sound finishes playing
     */
    finished () {
        const storedContext = this;
        return new Promise(resolve => {
            storedContext.bufferSource.onended = function () {
                this.isPlaying = false;
                resolve();
            }.bind(storedContext);
        });
    }
}

module.exports = SoundPlayer;
