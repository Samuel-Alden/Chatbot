let baileysPromise = null

function loadBaileys() {
    if (!baileysPromise) {
        baileysPromise = import('baileys')
    }
    return baileysPromise
}

module.exports = { loadBaileys }
