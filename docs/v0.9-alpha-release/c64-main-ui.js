"use strict";
// c64-kbd.ts - Web browser keyboard events to Commodore 64 scan codes
//
////////////////////////////////////////////////////////////////////////////////
//
// ts-emu-c64
// C64/6502 Emulator for Web Browser
//
// MIT License
//
// Copyright (c) 2020 by David R. Van Wagner
// davevw.com
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
////////////////////////////////////////////////////////////////////////////////
// PC(US) keyboard to Commodore keyboard symbolic mapping
// STOP(ESC) F1 F2 F3 F4 F5 F6 F7 F8 Help(F9)                  Run/Stop(Pause/Break)
//           1! 2@ 3# 4$ 5% 6^ 7& 8* 9( 0) -_ += DelIns Ins HmClr Rstr     / * -
// Ctrl(Tab) Q  W  E  R  T  Y  U  I  O  P  [  ]  £ (\)  Del       (PUp)  7 8 9 +
//           A  S  D  F  G  H  J  K  L  ;: '" Return                     4 5 6
// LShift    Z  X  C  V  B  N  M  ,< .> /?  RShift            Up         1 2 3
// C=(Ctrl)           SPACEBAR              C=(Ctrl)    Lft  Down  Rt    0 .   Enter
// Commodore 64/128 scan code table - adapted from Commodore 128 Programmer's Reference Guide by Commodore
//
//    0*8 1*8 2*8 3*8 4*8 5*8 6*8 7*8 K0  K1  K2
// +0 DEL 3#  5%  7'  9)  +   £|  1!  Hlp ESC Alt
// +1 RET W   R   Y   I   P   *   LAr 8   +   0
// +2 Rt  A   D   G   J   L   ;]  Ctl 5   -   .
// +3 F7  4$  6&  8(  0   -   Hme 2"  Tab Lf  Up
// +4 F1  Z   C   B   M   .>  RSh Spc 2   Ent Down
// +5 F3  S   F   H   K   :[  =   C=  4   6   Lt
// +6 F5  E   T   U   O   @   UpA Q   7   9   Rt
// +7 Dn  LSh X   V   N   ,<  /?  Stp 1   3   NoScroll
//
// NMI RESTORE
// 40/80 Disp
// P6510 Caps
// STA $DC00 (columns)
// LDA $DC01 (rows)
// LDA $D02F (K0-K2)
// D501 ()
//
// Commodore 64 keyboard layout (note some of the punctuation placement, matters for adapting PC keyboard to C64)
// (Normal) ←1234567890+-£ Hm Dl
//   Control qwertyuiop@*↑ Restr
// Stop ShLk asdfghjkl:;= Return
//   C= Shft zxcvbnm,./ Sh Dn Rt
//
// (Shifted) !"#$%&'()     Cl In
//           QWERTYUIOP  pi(greek letter for 3.1415..)
//           ASDFGHJKL[]=
//           ZXCVBNM<>?    Up Lt
let keyDictionary = {
    'a': { scan: 10 },
    'b': { scan: 28 },
    'c': { scan: 20 },
    'd': { scan: 18 },
    'e': { scan: 14 },
    'f': { scan: 21 },
    'g': { scan: 26 },
    'h': { scan: 29 },
    'i': { scan: 33 },
    'j': { scan: 34 },
    'k': { scan: 37 },
    'l': { scan: 42 },
    'm': { scan: 36 },
    'n': { scan: 39 },
    'o': { scan: 38 },
    'p': { scan: 41 },
    'q': { scan: 62 },
    'r': { scan: 17 },
    's': { scan: 13 },
    't': { scan: 22 },
    'u': { scan: 30 },
    'v': { scan: 31 },
    'w': { scan: 9 },
    'x': { scan: 23 },
    'y': { scan: 25 },
    'z': { scan: 12 },
    'A': { scan: 10 },
    'B': { scan: 28 },
    'C': { scan: 20 },
    'D': { scan: 18 },
    'E': { scan: 14 },
    'F': { scan: 21 },
    'G': { scan: 26 },
    'H': { scan: 29 },
    'I': { scan: 33 },
    'J': { scan: 34 },
    'K': { scan: 37 },
    'L': { scan: 42 },
    'M': { scan: 36 },
    'N': { scan: 39 },
    'O': { scan: 38 },
    'P': { scan: 41 },
    'Q': { scan: 62 },
    'R': { scan: 17 },
    'S': { scan: 13 },
    'T': { scan: 22 },
    'U': { scan: 30 },
    'V': { scan: 31 },
    'W': { scan: 9 },
    'X': { scan: 23 },
    'Y': { scan: 25 },
    'Z': { scan: 12 },
    'Enter': { scan: 1 },
    'Tab': { scan: 58 },
    'Escape': { scan: 63 },
    'Pause': { scan: 63 },
    'ShiftLeft': { scan: 15 },
    'ShiftRight': { scan: 52 },
    'ControlLeft': { scan: 61 },
    'ControlRight': { scan: 61 },
    'AltLeft': { scan: 61 },
    'AltRight': { scan: 61 },
    'Backspace': { scan: 0 },
    'Insert': { scan: 0, shift: 1 },
    'Delete': { scan: 0 },
    'Home': { scan: 51 },
    'ArrowUp': { scan: 7, shift: 1 },
    'ArrowDown': { scan: 7 },
    'ArrowLeft': { scan: 2, shift: 1 },
    'ArrowRight': { scan: 2 },
    'PageUp': { scan: 1024 + 64 },
    '1': { scan: 56, shift: 0 },
    '2': { scan: 59, shift: 0, release: '@' },
    '3': { scan: 8, shift: 0 },
    '4': { scan: 11, shift: 0 },
    '5': { scan: 16, shift: 0 },
    '6': { scan: 19, shift: 0, release: '^' },
    '7': { scan: 24, shift: 0, release: '&' },
    '8': { scan: 27, shift: 0, release: '*' },
    '9': { scan: 32, shift: 0, release: '(' },
    '0': { scan: 35, shift: 0, release: ')' },
    ' ': { scan: 60 },
    '!': { scan: 56, shift: 1 },
    '"': { scan: 59, shift: 1 },
    '#': { scan: 8, shift: 1 },
    '$': { scan: 11, shift: 1 },
    '%': { scan: 16, shift: 1 },
    '&': { scan: 19, shift: 1 },
    "'": { scan: 24, shift: 1, release: '"' },
    '(': { scan: 27, shift: 1 },
    ')': { scan: 32, shift: 1 },
    '*': { scan: 49, shift: 0 },
    '^': { scan: 54, shift: 0 },
    '@': { scan: 46, shift: 0 },
    '+': { scan: 40, shift: 0 },
    '=': { scan: 53, shift: 0, release: '+' },
    '-': { scan: 43, shift: 0, release: '_' },
    '_': { scan: 57, shift: 0 },
    ':': { scan: 45, shift: 0 },
    '[': { scan: 45, shift: 1 },
    ';': { scan: 50, shift: 0, release: ':' },
    ']': { scan: 50, shift: 1 },
    ',': { scan: 47, shift: 0 },
    '<': { scan: 47, shift: 1 },
    '.': { scan: 44, shift: 0 },
    '>': { scan: 44, shift: 1 },
    '/': { scan: 55, shift: 0 },
    '?': { scan: 55, shift: 1 },
    '\\': { scan: 48 },
    'F1': { scan: 4 },
    'F2': { scan: 4, shift: 1 },
    'F3': { scan: 5 },
    'F4': { scan: 5, shift: 1 },
    'F5': { scan: 6 },
    'F6': { scan: 6, shift: 1 },
    'F7': { scan: 3 },
    'F8': { scan: 3, shift: 1 },
};
let keys = [];
let last_keys = "";
let cpuWorker;
class C64keymapper {
    constructor(worker) {
        var _a;
        document.addEventListener("keydown", C64keyEvent, true);
        document.addEventListener("keyup", C64keyEvent, true);
        cpuWorker = worker;
        document.addEventListener("input", C64inputEvent);
        (_a = document.getElementById("return")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", C64ReturnClicked);
    }
}
function C64ReturnClicked(ev) {
    let input = document.getElementById("input");
    let data = input.value;
    input.value = "";
    // send each key to keydown/keyup handler
    let i;
    for (i = 0; data != null && i < data.length; ++i) {
        let c = data[i];
        if (c == '\n')
            c = 'Enter';
        let evt = new KeyboardEvent("keydown", { key: c });
        C64keyEventEx(evt);
        evt = new KeyboardEvent("keyup", { key: c });
        C64keyEventEx(evt);
    }
    let c = "Enter";
    let evt = new KeyboardEvent("keydown", { key: c });
    C64keyEventEx(evt);
    evt = new KeyboardEvent("keyup", { key: c });
    C64keyEventEx(evt);
}
function C64inputEvent(ev) {
    let input = ev;
    let data = input.data;
    // // log it
    // let date = new Date();
    // let msg = (date.getSeconds()+date.getMilliseconds()/1000) + 
    //    " input data=" + input.data +
    //    //" xfer=" + input.dataTransfer +
    //    " type=" + input.inputType +
    //    " comp=" + input.isComposing;
    // const log: HTMLElement | null = document.getElementById("result");
    // if (log)
    //     log.innerHTML = log.innerHTML + "<br>" + msg;
    //console.log("input " + data);
    // remove whatever is typed from input field
    let clear = document.getElementById("clear input").checked;
    if (clear) {
        document.getElementById("input").value = "";
        // send each key to keydown/keyup handler
        let i;
        for (i = 0; !input.isComposing && data != null && i < data.length; ++i) {
            let c = data[i];
            if (c == '\n')
                c = 'Enter';
            let evt = new KeyboardEvent("keydown", { key: c });
            C64keyEventEx(evt);
            evt = new KeyboardEvent("keyup", { key: c });
            C64keyEventEx(evt);
        }
    }
}
function C64keyEvent(event) {
    let result = C64keyEventEx(event);
    if (!result) {
        event.preventDefault(); // disable all keys default actions (as allowed by OS and user agent)
        event.stopPropagation();
    }
    return result;
}
function C64keyEventEx(event) {
    let i;
    let scan = 64;
    let key = keyDictionary[event.key];
    if (key == null)
        key = keyDictionary[event.code];
    if (key != null)
        scan = key.scan;
    let release = key === null || key === void 0 ? void 0 : key.release;
    switch (key === null || key === void 0 ? void 0 : key.shift) {
        case 0: // delete shift
            i = keys.indexOf(keyDictionary['ShiftLeft'].scan);
            if (i >= 0)
                keys.splice(i, 1);
            i = keys.indexOf(keyDictionary['ShiftRight'].scan);
            if (i >= 0)
                keys.splice(i, 1);
            break;
        case 1: // add shift
            if (keys.indexOf(keyDictionary['ShiftLeft'].scan) < 0
                && keys.indexOf(keyDictionary['ShiftRight'].scan) < 0)
                keys.push(keyDictionary['ShiftLeft'].scan);
            break;
    }
    // log it
    // let date = new Date();
    // let modifiers = (event.metaKey ? '1' : '0') + (event.altKey ? '1' : '0') + (event.ctrlKey ? '1' : '0') + (event.shiftKey ? '1' : '0');
    // let msg = (date.getSeconds()+date.getMilliseconds()/1000) + 
    //   " " + event.type + " keyCode=" + event.keyCode + " code=" + event.code + " key=" + event.key + " modifiers=" + modifiers + " scan=" + scan;
    // //console.log(msg);
    // const log: HTMLElement | null = document.getElementById("result");
    // if (log)
    //   log.innerHTML = log.innerHTML + "<br>" + msg;
    //console.log(event.type + " " + event.key + " " + event.code + " " + scan);
    if (event.type == "keydown") {
        if (scan != 64) {
            if (keys.indexOf(scan) < 0)
                keys.push(scan);
        }
        else if (event.code == "F9")
            toggleAbout();
    }
    else if (event.type == "keyup") {
        i = keys.indexOf(scan);
        if (i < 0 && !event.shiftKey && release != null) // did we get keyup for unshifted version of keydown and keyCode did not match
            i = keys.indexOf(keyDictionary[release].scan);
        if (i >= 0)
            keys.splice(i, 1);
        if (keys.length > 0 && !event.shiftKey) {
            // browser bug or feature: pressing both shift keys, releasing both only gets one release
            // if no shift keys reported, make sure we lift keys from our array
            i = keys.indexOf(52); // Right Shift
            if (i >= 0)
                keys.splice(i, 1);
            i = keys.indexOf(15); // Left Shift
            if (i >= 0)
                keys.splice(i, 1);
        }
        if (keys.length > 0 && !event.altKey && !event.ctrlKey) {
            // browser may miss reporting keyup on Alt, e.g. toggle menus, ALT+Tab
            i = keys.indexOf(61); // C=
            if (i >= 0)
                keys.splice(i, 1);
        }
    }
    //console.log(sendkeys.toString());
    let msg = keys.toString();
    if (msg != last_keys) {
        cpuWorker.postMessage({ keys: msg });
        last_keys = msg;
    }
    return (scan == 64);
}
// c64-main-ui.ts - Commodore 64 display drawing
//
////////////////////////////////////////////////////////////////////////////////
//
// ts-emu-c64
// C64/6502 Emulator for Web Browser
//
// MIT License
//
// Copyright (c) 2020 by David R. Van Wagner
// davevw.com
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
////////////////////////////////////////////////////////////////////////////////
var canvas = document.getElementById("screen");
canvas.addEventListener("drop", dropHandler);
canvas.addEventListener("dragover", dragOverHandler);
canvas.addEventListener("click", canvasClick);
var ctx = canvas === null || canvas === void 0 ? void 0 : canvas.getContext("2d");
ctx.fillStyle = "#000000";
ctx.fillRect(0, 0, 320, 200);
var about_img = new Image();
var about_loaded = false;
var about_active = false;
about_img.addEventListener("load", function () {
    ctx.drawImage(about_img, 0, 0);
    about_loaded = true;
}, false);
about_img.src = "emuc64-about.png";
function toggleAbout() {
    if (about_active) {
        about_active = false;
        drawC64Screen();
    }
    else {
        about_active = true;
        ctx.drawImage(about_img, 0, 0);
    }
}
function canvasClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (about_active) {
        if (event.clientX >= 48 && event.clientY >= 48 && event.clientY < (200 / 3) + 48) // top third, not border
            window.open("https://github.com/davervw/ts-emu-c64/blob/master/README.md");
        else if (event.clientX >= 48 && event.clientX <= (320 / 3) + 48 && event.clientY >= (200 / 3 * 2) + 48 && event.clientY < 200 + 48) // SW corner, not border
            toggleKeys();
        else
            toggleAbout();
    }
    else
        toggleAbout();
}
var w; // worker
function startWorker() {
    //return false;
    if (typeof (Worker) !== "undefined") {
        if (typeof (w) == "undefined") {
            w = new Worker("c64-6502.js");
        }
        w.onmessage = function (event) {
            if (event.data[0] == "char")
                drawC64Char(ctx, event.data[1], event.data[2], event.data[3], event.data[4], event.data[5]);
            else if (event.data[0] == "border")
                drawC64Border(canvas, event.data[1]);
            else if (event.data[0] == "save")
                startSave(event.data[1], event.data[2]);
        };
        return true;
    }
    else {
        var result = document.getElementById("result");
        if (result != null)
            result.innerHTML = "Sorry, your browser does not support Web Workers...";
    }
    return false;
}
if (startWorker() && w != null) // start worker
 {
    w.postMessage({ basic: c64_basic_rom, char: c64_char_rom, kernal: c64_kernal_rom });
    let c64keys = new C64keymapper(w); // start keyboard driver
    hideSave();
    let saveButton = document.getElementById("save");
    saveButton === null || saveButton === void 0 ? void 0 : saveButton.addEventListener("click", fileSave);
}
var saveStream = [];
var saveLink = null;
var keysVisible = false;
function toggleKeys() {
    if (keysVisible)
        hideKeys();
    else
        showKeys();
}
function hideKeys() {
    let saveControls = document.getElementById("key controls");
    if (saveControls) {
        saveControls.style.visibility = "collapse";
        keysVisible = false;
        about_img.src = "emuc64-about.png";
    }
}
function showKeys() {
    let saveControls = document.getElementById("key controls");
    if (saveControls) {
        saveControls.style.visibility = "visible";
        keysVisible = true;
        about_img.src = "emuc64-about-mobilekbd.png";
    }
}
function hideSave() {
    let saveControls = document.getElementById("save controls");
    if (saveControls)
        saveControls.style.visibility = "collapse";
}
function showSave() {
    let saveControls = document.getElementById("save controls");
    if (saveControls)
        saveControls.style.visibility = "visible";
}
function fileSave(e) {
    let desc = document.getElementById("filename");
    var filename = desc ? desc.innerText : 'FILENAME.PRG';
    // download file
    // modified from https://stackoverflow.com/questions/54567948/how-to-show-pdf-in-browser-using-byte-array-of-pdf-in-javascript
    var bytes = new Uint8Array(saveStream.length);
    var i;
    for (i = 0; i < saveStream.length; ++i)
        bytes[i] = saveStream[i];
    var blob = new File([bytes], filename, { type: "application/x-c64-pdb" });
    saveLink = window.URL.createObjectURL(blob);
    var new_window = window.open(saveLink, filename, '');
    if (new_window)
        new_window.addEventListener("load", finishSave);
    else
        finishSave();
    if (desc)
        desc.innerText = "";
    saveStream = []; // throw away bytes
    // toggle save button hidden
    hideSave();
}
// cleanup after createObjectURL
function finishSave() {
    if (saveLink)
        window.URL.revokeObjectURL(saveLink);
    saveLink = null;
}
function startSave(filename, stream) {
    finishSave(); // close previous save if in progress
    // toggle save button visible
    showSave();
    saveStream = stream;
    let desc = document.getElementById("filename");
    if (desc)
        desc.innerText = filename;
    saveStream = stream;
}
// c64-draw.ts - Commodore 64 display drawing
//
////////////////////////////////////////////////////////////////////////////////
//
// ts-emu-c64
// C64/6502 Emulator for Web Browser
//
// MIT License
//
// Copyright (c) 2020 by David R. Van Wagner
// davevw.com
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
////////////////////////////////////////////////////////////////////////////////
let C64colors = [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [192, 0, 0, 255],
    [0, 255, 255, 255],
    [160, 32, 160, 255],
    [32, 160, 32, 255],
    [64, 64, 192, 255],
    [255, 255, 128, 255],
    [255, 128, 0, 255],
    [128, 64, 0, 255],
    [192, 32, 32, 255],
    [64, 64, 64, 255],
    [128, 128, 128, 255],
    [160, 255, 160, 255],
    [128, 128, 255, 255],
    [192, 192, 192, 255],
];
function toHex(value, digits) {
    let s = value.toString(16).toUpperCase();
    while (s.length < digits)
        s = "0" + s;
    return s;
}
function toHex8(value) {
    return toHex(value, 2);
}
function drawC64Screen() {
    cpuWorker.postMessage({ redraw: true });
}
function drawC64Border(canvas, color) {
    color = color & 0xF;
    let rgb = C64colors[color];
    canvas.style.borderColor = "#" + toHex8(rgb[0]) + toHex8(rgb[1]) + toHex8(rgb[2]);
}
function drawC64Char(ctx, chardata, x, y, fg, bg) {
    var char = new ImageData(8, 8);
    var b;
    var r;
    if (about_active)
        return; // don't overwrite about screen
    fg = fg & 0xF;
    bg = bg & 0xF;
    for (r = 0; r < 8; ++r) {
        for (b = 0; b < 8; ++b) {
            var j = (r * 8 + (7 - b)) * 4;
            if ((chardata[r] & (1 << b)) != 0) {
                char.data[j + 0] = C64colors[fg][0];
                char.data[j + 1] = C64colors[fg][1];
                char.data[j + 2] = C64colors[fg][2];
                char.data[j + 3] = C64colors[fg][3];
            }
            else {
                char.data[j + 0] = C64colors[bg][0];
                char.data[j + 1] = C64colors[bg][1];
                char.data[j + 2] = C64colors[bg][2];
                char.data[j + 3] = C64colors[bg][3];
            }
        }
    }
    ctx.putImageData(char, x, y);
}
// c64-drag-drop.ts - Commodore 64 display drawing
//
////////////////////////////////////////////////////////////////////////////////
//
// ts-emu-c64
// C64/6502 Emulator for Web Browser
//
// MIT License
//
// Copyright (c) 2020 by David R. Van Wagner
// davevw.com
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
////////////////////////////////////////////////////////////////////////////////
// modified from https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
function dropHandler(ev) {
    if (ev.dataTransfer == null)
        return;
    console.log('File(s) dropped');
    // Prevent default behavior (Prevent file from being opened)
    ev.preventDefault();
    if (ev.dataTransfer.items) {
        // Use DataTransferItemList interface to access the file(s)
        for (var i = 0; i < ev.dataTransfer.items.length; i++) {
            // If dropped items aren't files, reject them
            if (ev.dataTransfer.items[i].kind === 'file') {
                var file = ev.dataTransfer.items[i].getAsFile();
                if (file != null) {
                    console.log('... file[' + i + '].name = ' + file.name);
                    var reader = new FileReader();
                    reader.onload = function (e) {
                        if (e.target != null) {
                            var array = new Uint8Array((e.target.result));
                            if (ev.altKey || ev.ctrlKey)
                                cpuWorker.postMessage({ autoexec: array });
                            else
                                cpuWorker.postMessage({ attach: array });
                        }
                    };
                    reader.readAsArrayBuffer(file);
                    break; // only support one file
                }
            }
        }
    }
    else {
        // Use DataTransfer interface to access the file(s)
        for (var i = 0; i < ev.dataTransfer.files.length; i++) {
            console.log('... file[' + i + '].name = ' + ev.dataTransfer.files[i].name);
            break; // only support one file
        }
    }
}
function dragOverHandler(ev) {
    console.log('File(s) in drop zone');
    // Prevent default behavior (Prevent file from being opened)
    ev.preventDefault();
}
//# sourceMappingURL=c64-main-ui.js.map