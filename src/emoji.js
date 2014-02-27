//
// (c) 2014 Loco Mojis
// All Rights Reserved.
// 
// You can study the code for learning purposes.
// You can use it on noncommercial websites.
// But you are not allowed to redistribute 
// this as an extension in whole or in part.
// You are not allowed to use the replacement 
// engine inside commercial software without
// the author's permission.
// This license should be included in all cases.
// Contact: locomojis@gmail.com
//
(function () {

var settings = {};
var emojisByChar = {}
var allChars = [];
var items = chardict.items;

for (var i in items) {
  if (items.hasOwnProperty(i)) {
    var chars = items[i].chars;
    for (var j = chars.length; j--;) {
      emojisByChar[chars[j]] = items[i];
      allChars.push(chars[j]);
    }
  }
}

var pattern = new RegExp(allChars.join('|'));

function makeBatchRecursion(func, iterations) {
  var self = this;
  var counter = 0;
  return function () {
    var args = arguments;
    if (++counter % iterations == 0)
      setZeroTimeout(function () {
        func.apply(self, args);
      });
    else
      func.apply(self, args);
  };
}

var walkTheDOM = function (node, func) {
  if (func(node)) {
    node = node.firstChild;
    while (node) {
      walkTheDOM(node, func);
      node = node.nextSibling;
    } 
  }
}

//REM: gotta make sure there's no conflict w mutation observer
//walkTheDOM = makeBatchRecursion(walkTheDOM, 300);

function insertEmojisOnLeaves(node) {
  if (/script|style|textarea/i.test(node.nodeName)) 
    return false; // stop walking at these nodes
  if (node.$isContentEditable || node.$emoji) 
    return false; // stop walking at these nodes
  if (node.nodeType != 3)
    return true;  // continue if it's not a leaf
    //return pattern.test(node.textContent);

  // from this point we can be sure it's a leaf (textNode)
  // recursively swap emojis
  splitAndInsertInBetween(node);

  // stop walking cause we've just processed a leaf
  return false; 
}

// splits the textNode into 3 pieces
// emoji is in the middle
// recursively continues on the remainder text
function splitAndInsertInBetween(node) {

  var data   = node.data;
  var result = pattern.exec(data) || [];
  var match  = result[0];

  // if there's no emoji found, we have nothing to do 
  // if we don't know this emoji, we stop here as well
  if (!match || !isEmojiExists(match)) return;

  var emoji = settings.usefont ? getEmojiText(match) : getEmojiImage(match);
  var parent = node.parentNode;

  // the text after the match becomes the textNode
  // we take care of variation selectors here as well
  var after = data.slice(result.index + match.length);
  node.data = after.replace('\uFE0F', ''); 

  // insert emoji before that
  parent.insertBefore(emoji, node);

  // then the text before the emoji
  var before = data.slice(0, result.index);
  if (before) {
    before = document.createTextNode(before);
    parent.insertBefore(before, emoji);
  }
 
  // continue searching for emojis in the remainder
  if (after) {
    splitAndInsertInBetween(node);
  }
}

function isEmojiExists(ch) {
  return !!emojisByChar[ch];
}


var imageQueue = [];

function imageOnload(e) {
  var img = imageQueue.shift();
  if (img && img.$src) {
    img.src = img.$src;
    delete img.$src; 
  }
}

// create image only once for performance reasons
var baseUrl = chrome.extension.getURL('images');
var dummyImage = document.createElement('img');
dummyImage.className = 'chromoji';           

function getEmojiImage(ch) {
  var emoji = emojisByChar[ch];
  var img = dummyImage.cloneNode(true);   
  img.title = emoji.name; 
  img.alt = ch; // for copying
  // image loading is delayed to keep the UI more responsive   
  //img.style.visibility = 'hidden';
  //img.src = baseUrl + '/' + emoji.image;  
  //requestAnimationFrame(function () {
    //img.src = baseUrl + '/' + emoji.image;  
    //img.style.visibility = '';
  //});
  img.$src = baseUrl + '/' + emoji.image;              
  img.onload  = imageOnload;
  img.onerror = imageOnload;    
  imageQueue.push(img);
  return img;
}

function insertCSS() {
  if (insertCSS.done) return;
  insertCSS.done = true;
  chrome.runtime.sendMessage('insertCSS');
}
insertCSS.done = false;

function getEmojiText(ch) {
  var el = document.createElement('span');
  el.id = 'chromoji-font'; // only way to ensure ultimate specificity
  el.className = 'chromoji-font';
  el.textContent = ch;
  el.$emoji = true;
  //el.id = '';
  //el.className = 'chromoji-bg chromoji-' + emojisByChar[ch].image.split('.')[0];
  //insertCSS();
  return el;
}


var editableSelector = '[contenteditable=true], [contenteditable=plaintext-only]';
// root.querySelectorAll('input, textarea, ' + editableSelector)

function insertEmojis(root) {
  root = root || document.body;
  if (root.nodeType == 3) {
    splitAndInsertInBetween(root);
  } else {
    // performance optimization
    var els = root.querySelectorAll(editableSelector)
    for (var i = els.length; i--;) {
      els[i].$isContentEditable = true;
    }
    // insert emojis
    walkTheDOM(root, insertEmojisOnLeaves);
  }
  // kick off the parallel loading of images
  if (imageQueue.length)
    for (var i = 10; i--;)
      imageOnload();
}

function removeHiddenEmojis() {
  if (settings.hidePUA) {
    allChars = allChars.filter(function (ch) {
      return !isCharPUA(ch);
    });
    pattern = new RegExp(allChars.join('|'));
  }
}

// PUA - Private Use Area
function isCharPUA(ch) {
  if (ch.length == 1)
    var code = ch.charCodeAt(0);
  else
    var code = (ch.charCodeAt(0) - 0xD800) * 0x400 
             +  ch.charCodeAt(1) - 0xDC00 + 0x10000;
  return (code >= 0xE000   && code <= 0xF8FF  ||
          code >= 0xF0000  && code <= 0xFFFFD ||
          code >= 0x100000 && code <= 0x10FFFD) 
}

var observer = new MutationObserver(onMutation);
var observerConfig = {
    attributes: false, 
    characterData: false,
    childList: true, 
    subtree: true
};
observer.start = function() {
  observer.observe(document.body, observerConfig);
};
observer.stop = function() {
  observer.disconnect();
};

// may be overwritten by the paste script
window.createPasteFrameInstances = function () {}; 

function onMutation(records) {
  observer.stop();
  insertEmojis();
  /*
  // TODO: it may be inside a contentEditable node!
  if (!records) return;
  records.forEach(function (record) {
    var nodes = record.addedNodes;
    if (nodes.length) 
      [].forEach.call(nodes, insertEmojis);
  });
  */
  initPasteFrameInstances();
  observer.start();
}

function addGlobalStyle() {
  var css = document.createElement("style");
  var cssScale = settings.scale + 'em !important';
  css.innerHTML = 'img.chromoji { width:'+ cssScale +'; height:'+ cssScale +'; }' + 
                  '.chromoji-font, #chromoji-font { font-size:'+ cssScale +'; }';
  document.head.appendChild(css);
}

function init() {
  ///return///
  addGlobalStyle();
  start = +new Date///
  insertEmojis();
  console.log('chromoji: ' + (new Date - start))///
  observer.start();
}
window.insertEmojis = insertEmojis;

// start things off by getting the settings from the background page
chrome.extension.sendMessage('get_settings', function (settings_) {
  settings = settings_;

  // stop now if domain is on the blacklist
  for (var i = settings.blacklist.length; i--;)
    if (document.domain.indexOf(settings.blacklist[i]) != -1)
      return;

  removeHiddenEmojis();

  // start the initialization at this point
  if (isDocumentReady())
    init()
  else
    window.addEventListener("DOMContentLoaded", init, false);
});

function isDocumentReady() {
  return /complete|loaded|interactive/.test(document.readyState);
}

})();

// http://dbaron.org/log/20100309-faster-timeouts
(function() {
    var timeouts = [];
    var messageName = "zero-timeout-message";
    function setZeroTimeout(fn) {
        timeouts.push(fn);
        window.postMessage(messageName, "*");
    }
    function handleMessage(event) {
        if (event.source == window && event.data == messageName) {
            event.stopPropagation();
            if (timeouts.length > 0) {
                var fn = timeouts.shift();
                fn();
            }
        }
    }
    window.addEventListener("message", handleMessage, true);
    window.setZeroTimeout = setZeroTimeout;
})();