var socketio = require('socket.io-client')
  , mtgox = require('mtgox-orderbook')
  , device = require('coremidi')()
  , midi = require('midi-api')
  , solfege = require('solfege')

var scale = ['do', 'di', 're', 'ri', 'mi', 'fa', 'fi', 'sol', 'si', 'la', 'li', 'ti'];

// calculate the full note set
var notes = []
  , degree = 0
  , lastNote = 0
  , nextNote
  , lastSyllable = scale[0]
  , nextSyllable = null

while (true) {
  if (degree === scale.length) {
    degree = 0;
  }
  var nextSyllable = scale[degree];
  var nextNote = solfege.moveUp(lastSyllable, nextSyllable);
  if (typeof lastNote === 'number') {
    nextNote += lastNote;
  }
  if (nextNote > 127) {
    break;
  }
  notes.push(nextNote);
  lastSyllable = nextSyllable;
  lastNote = nextNote;
  degree++;
}

var maxTradeVolume = -1
  , lastTradePrice = 0
  , lastTradeNote = 60

var voices = {
  ask: {
    synth: midi({end: false}).channel(0).bank(0).program(10)
  },
  bid: {
    synth: midi({end: false}).channel(1).bank(0).program(4)
  },
  trade: {
    synth: midi({end: false}).channel(2).bank(0).program(54)
  }
};

Object.keys(voices).forEach(function (k) {
  voices[k].synth.pipe(device);
});

// now subscribe to depth updates.
var conn = socketio.connect(mtgox.socketio_url);
var obook = mtgox.attach(conn, 'usd');
obook.on('depth', writeEvent);
obook.on('trade', writeEvent);

function writeEvent (detail) {
  var price = Number(detail.price);

  if (!lastTradePrice && detail.type !== 'trade') return;

  var volume = Number(detail.volume || detail.amount);
  if (volume <= 0) return;

  var voice = voices[detail.type_str || detail.type];

  var diff = 0;
  if (detail.type === 'trade') {
    if (price > lastTradePrice) {
      diff = 1;
    }
    else if (price < lastTradePrice) {
      diff = -1;
    }
    lastTradeNote += diff;
    nextNote = lastTradeNote;
    if (nextNote > 100 || nextNote < 20) {
      nextNote = lastTradeNote = 60;
    }
    maxTradeVolume = Math.max(Number(detail.amount), maxTradeVolume);
  }
  else {
    diff = Math.round(price - lastTradePrice);
    nextNote = lastTradeNote + diff;
  }

  voice.maxVolume = Math.max(voice.maxVolume, volume);
  var velocity = 127; // Math.max(20, Math.round((volume / maxTradeVolume) * 127));

  console.log(detail.type_str || detail.type, diff, nextNote, velocity);
  console.log(detail);
  voice.synth.noteOff().noteOn(nextNote, velocity);

  if (detail.type === 'trade') {
    lastTradePrice = price;
  }
}