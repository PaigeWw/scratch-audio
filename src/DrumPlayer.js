const SoundPlayer = require('./SoundPlayer');
const Tone = require('tone');

class DrumPlayer {
    /**
     * A prototype for the drum sound functionality that can load drum sounds, play, and stop them.
     * @param {Tone.Gain} outputNode - a webAudio node that the drum sounds will send their output to
     * @constructor
     */
    constructor (outputNode) {
        this.outputNode = outputNode;

        const baseUrl = 'https://raw.githubusercontent.com/LLK/scratch-audio/develop/sound-files/drums/';
        const fileNames = [
            'SnareDrum(1)',
            'BassDrum(1b)',
            'SideStick(1)',
            'Crash(2)',
            'HiHatOpen(2)',
            'HiHatClosed(1)',
            'Tambourine(3)',
            'Clap(1)',
            'Claves(1)',
            'WoodBlock(1)',
            'Cowbell(3)',
            'Triangle(1)',
            'Bongo',
            'Conga(1)',
            'Cabasa(1)',
            'GuiroLong(1)',
            'Vibraslap(1)',
            'Cuica(2)'
        ];

        this.drumSounds = [];

        for (let i = 0; i < fileNames.length; i++) {
            const url = `${baseUrl + fileNames[i]}_22k.wav`;
            this.drumSounds[i] = new SoundPlayer(this.outputNode);
            this.drumSounds[i].setBuffer(new Tone.Buffer(url));
        }
    }

    /**
     * Play a drum sound.
     * The parameter for output node allows sprites or clones to send the drum sound
     * to their individual audio effect chains.
     * @param  {number} drum - the drum number to play (0-indexed)
     * @param  {Tone.Gain} outputNode - a node to send the output to
     */
    play (drum, outputNode) {
        this.drumSounds[drum].outputNode = outputNode;
        this.drumSounds[drum].start();
    }

    /**
     * Stop all drum sounds.
     */
    stopAll () {
        for (let i = 0; i < this.drumSounds.length; i++) {
            this.drumSounds[i].stop();
        }
    }
}

module.exports = DrumPlayer;
