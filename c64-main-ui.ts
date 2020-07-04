// c64-kbd.ts - Web browser keyboard events to Commodore 64 scan codes
//
////////////////////////////////////////////////////////////////////////////////
//
// simple-emu-c64
// C64/6502 Emulator for Microsoft Windows Console
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

// Web UI keyCodeToCBMScan[event.shiftKey ? 1 : 0][event.keyCode] to Commodore 64 scan code translation table

// event.keyCode for typical 101+ PC keyboard
//+---+---+---+---+---+---+---+---+---+---+---+---+---+                              +-----+-----+-----+
//|ESC|F1 |F2 |F3 |F4 |F5 |F6 |F7 |F8 |F9 |F10|F11|F12|                              |PtSc |ScLk |Brk  |
//|27 |112|113|114|115|116|117|118|119|120|121|122|123|                              |44   |145  |19   |
//+---+---+---+---+---+---+---+---+---+---+---+---+---+                              +-----+-----+-----+
//
//+---+---+---+---+---+---+---+---+---+---+---+---+---+---+  +----+----+----+  +-----+-----+-----+-----+
//|~` |!1 |@2 |#3 |$4 |%5 |^6 |&7 |*8 |(9 |)0 |_- |+= |Bsp|  |Ins |Home|PgUp|  |NmLk |/    |*    |-    |
//|192|49 |50 |51 |52 |53 |54 |55 |56 |57 |48 |189|187|8  |  |45  |36  |33  |  |144  |111  |106  |109  |
//+---+---+---+---+---+---+---+---+---+---+---+---+---+---+  +----+----+----+  +-----+-----+-----+-----+
//|Tab|Q  |W  |E  |R  |T  |Y  |U  |I  |O  |P  |{[ |}] ||\ |  |Del |End |PgDn|  |7 103|8 104|9 105|+    |
//|9  |81 |87 |69 |82 |84 |89 |85 |73 |79 |80 |219|221|220|  |46  |35  |34  |  |Hm 36|Up 38|PUp33|107  |
//+---+---+---+---+---+---+---+---+---+---+---+---+---+---+  +----+----+----+  +-----+-----+-----+     |
//|Cap|A  |S  |D  |F  |G  |H  |J  |K  |L  |:; |"' |Enter  |                    |4 100|5 101|6 102|     |
//|20 |65 |83 |68 |70 |71 |72 |74 |75 |76 |186|222|13     |                    |Lt 37|[] 12|Rt 39|     |
//+---+---+---+---+---+---+---+---+---+---+---+---+-------+       +----+       +-----+-----+-----+-----+
//|LShift |Z  |X  |C  |V  |B  |N  |M  |<, |>. |?/ |RShift |       |Up  |       |1 97 |2 98 |3 99 |Enter|
//|16     |90 |88 |67 |86 |66 |78 |77 |188|190|191|16     |       |38  |       |End35|Dn 40|PDn34|13   |
//+---+---+---+---+---+---+---+---+---+---+---+---+---+---+  +----+----+----+  +-----+-----+-----+     |
//|Ctl|Win|Alt|            SPACE          |Alt|Win|Mnu|Ctl|  |Lt  |Dn  |Rt  |  |0 96       |. 110|     |
//|17 |91 |18 |            32             |18 |92 |93 |17 |  |37  |40  |39  |  |Ins45      |Del46|     |
//+---+---+---+---------------------------+---+---+---+---+  +----+----+----+  +-----------+-----+-----+

// Commodore 64/128 scan code table - adapted from Commodore 128 Programmer's Reference Guide by Commodore
//
//    0*8 1*8 2*8 3*8 4*8 5*8 6*8 7*8 K0  K1  K2
// +0 DEL 3#  5%  7'  9)  +   £|  1!  Hlp ESC Alt
// +1 RET W   R   Y   I   P   *   LAr 8   +   0
// +2 Rt  A   D   G   J   L   ;]  Ctl 5   =   -
// +3 F7  4$  6&  8(  0   -   Hme 2"  Tab Lf  Up
// +4 F1  Z   C   B   M   .>  RSh Spc 2   Ent Down
// +5 F3  S   F   H   K   :[  =   C=  4   6   Lt
// +6 F5  E   T   U   O   @   UpA Q   6   9   Rt
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

// +256 = add left shift
// +512 = remove shift
// +1024 = RESTORE/NMI
// +2048 = CAPS
let keyCodeToCBMScan: number[][] =
    [
        [ // [0][0..255] unshifted
            64, 64, 64, 64, 64, 64, 64, 64, 0, 58, // 0: na, na, na, na, na, na, na, na, DEL, CTRL
            64, 64, 64, 1, 64, 64, 15, 61, 61, 63, // 10: na, na, na, RET, na, na, LShift, C=, C=, STOP
            2048 + 64, 64, 64, 64, 64, 64, 64, 63, 64, 64, // 20: CAPS, na, na, na, na, na, na, STOP, na, na
            64, 64, 60, 1024 + 64, 64, 64, 51, 256 + 2, 256 + 7, 2, // 30: na, na, SPC, RESTORE, na, na, HM, LT, UP, RT
            7, 64, 64, 64, 64, 256 + 0, 0, 64, 35, 56, // 40: DN, na, na, na, na, INS, DEL, na, 0, 1
            59, 8, 11, 16, 19, 24, 27, 32, 64, 50, // 50: 2, 3, 4, 5, 6, 7, 8, 9, na, ;
            64, 53, 64, 64, 64, 10, 28, 20, 18, 14, // 60: na, =, na, na, na, A, B, C, D, E
            21, 26, 29, 33, 34, 37, 42, 36, 39, 38, // 70: F, G, H, I, J, K, L, M, N, O
            41, 62, 17, 13, 22, 30, 31, 9, 23, 25, // 80: P, Q, R, S, T, U, V, W, X, Y
            12, 64, 64, 64, 64, 64, 35, 56, 59, 8, // 90: Z, na, na, na, na, na, [0], [1], [2], [3]
            11, 16, 19, 24, 27, 32, 49, 40, 64, 43, // 100: [4], [5], [6], [7], [8], [9], [*], [+], na, [-]
            44, 55, 4, 256 + 4, 5, 256 + 5, 6, 256 + 6, 3, 256 + 3, // 110: [.], /, F1, F2, F3, F4, F5, F6, F7, F8
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 120: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 130: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 140: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 150: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 160: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 43, 64, 64, 64, 64, 64, 64, // 170: na, na, na, -, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 50, 53, 47, 43, // 180: na, na, na, na, na, na, ;, =, ,, -
            44, 55, 256 + 24, 64, 64, 64, 64, 64, 64, 64, // 190: ., /, ', na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 200: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 256 + 45, // 210: na, na, na, na, na, na, na, na, na, [
            48, 256 + 50, 256 + 24, 64, 64, 64, 64, 64, 64, 64, // 220: £, ], ', na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 230: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 240: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64                  // 250: na, na, na, na, na, na
        ],
        [ // [1][0..255] // shifted
            64, 64, 64, 64, 64, 64, 64, 64, 0, 58, // 0: na, na, na, na, na, na, na, na, DEL, CTRL
            64, 64, 64, 1, 64, 64, 15, 61, 61, 63, // 10: na, na, na, RET, na, na, LShift, C=, C=, STOP
            2048 + 64, 64, 64, 64, 64, 64, 64, 63, 64, 64, // 20: CAPS, na, na, na, na, na, na, STOP, na, na
            64, 64, 60, 1024 + 64, 64, 64, 51, 256 + 2, 256 + 7, 2, // 30: na, na, SPC, RESTORE, na, na, HM, LT, UP, RT
            7, 64, 64, 64, 64, 256 + 0, 0, 64, 32, 56, // 40: DN, na, na, na, na, INS, DEL, na, ), !
            512 + 46, 8, 11, 16, 512 + 54, 19, 512 + 49, 27, 64, 512 + 45, // 50: @, #, $, %, ^, &, *, (, na, :
            64, 512 + 40, 64, 64, 64, 10, 28, 20, 18, 14, // 60: na, +, na, na, na, A, B, C, D, E
            21, 26, 29, 33, 34, 37, 42, 36, 39, 38, // 70: F, G, H, I, J, K, L, M, N, O
            38, 62, 17, 13, 22, 30, 31, 9, 23, 25, // 80: P, Q, R, S, T, U, V, W, X, Y
            12, 64, 64, 64, 64, 64, 512 + 35, 512 + 56, 512 + 59, 512 + 8, // 90: Z, na, na, na, na, na, [0], [1], [2], [3]
            512 + 11, 512 + 16, 512 + 19, 512 + 24, 512 + 27, 512 + 32, 512 + 49, 512 + 40, 64, 512 + 43, // 100: [4], [5], [6], [7], [8], [9], [*], [+], na, [-]
            512 + 44, 512 + 55, 4, 4, 5, 5, 6, 6, 3, 3, // 110: [.], [/], F2, F2, F4, F4, F6, F6, F8, F8
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 120: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 130: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 140: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 150: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 160: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 512 + 57, 64, 64, 64, 64, 64, 64, // 170: na, na, na, L.Arrow, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 512 + 45, 512 + 40, 47, 512 + 57, // 180: na, na, na, na, na, na, :, +, <, L.Arrow
            44, 55, 59, 64, 64, 64, 64, 64, 64, 64, // 190: >, ?, ", na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 200: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 45, // 210: na, na, na, na, na, na, na, na, na, [
            48, 50, 59, 64, 64, 64, 64, 64, 64, 64, // 220: £, ], ", na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 230: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64, 64, 64, 64, 64, // 240: na, na, na, na, na, na, na, na, na, na
            64, 64, 64, 64, 64, 64                  // 250: na, na, na, na, na, na
        ],
    ];

let keys: number[] = [];

let cpuWorker: Worker;

class C64keymapper {

    constructor(worker: Worker) {
        document.addEventListener("keydown", C64keyEvent);
        document.addEventListener("keyup", C64keyEvent);
        cpuWorker = worker;
    }
}

function C64keyEvent(event: KeyboardEvent): boolean {
    //console.log(event);
    let modifiers = (event.metaKey ? '1' : '0') + (event.altKey ? '1' : '0') + (event.ctrlKey ? '1' : '0') + (event.shiftKey ? '1' : '0');
    let keyCode = event.keyCode;
    if (keyCode == 0) { // Firefox Android has some missing keyCodes
        if (event.key == "'")
            keyCode = 222;
        else if (event.key == '"')
            keyCode = 222;
        else if (event.key == "-")
            keyCode = 189;
        else if (event.key == "_")
            keyCode = 189;
    }
    let scan = keyCodeToCBMScan[event.shiftKey ? 1 : 0][keyCode];
    if (event.code == "ShiftRight") // differentiate Right from Left for Commodore
        scan = 52; // Right Shift
    //let msg = event.type + " " + event.keyCode + " " + event.code + " " + event.key + " " + modifiers + " " + scan;
    //console.log(msg);
    // scan = (scan & 255);
    if (event.type == "keydown") {
        if (scan != 64 && keys.indexOf(scan) < 0)
            keys.push(scan);
        else if (event.code == "F9")
            toggleAbout();
    }
    else if (event.type == "keyup") {
        let i = keys.indexOf(scan);
        if (i < 0 && !event.shiftKey) // did we get keyup for unshifted version of keydown?  keyCode wouldn't match
            i = keys.indexOf(keyCodeToCBMScan[1][event.keyCode]);
        if (i >= 0)
            keys.splice(i,1);
        if (keys.length > 0 && !event.shiftKey) {
            // browser bug or feature: pressing both shift keys, releasing both only gets one release
            // if no shift keys reported, make sure we lift keys from our array
            i = keys.indexOf(52); // Right Shift
            if (i >= 0)
                keys.splice(i,1);
            i = keys.indexOf(15); // Left Shift
            if (i >= 0)
                keys.splice(i,1);
        }
        if (keys.length > 0 && !event.altKey) {
            // browser may miss reporting keyup on Alt, e.g. toggle menus, ALT+Tab
            i = keys.indexOf(61); // C=
            if (i >= 0)
                keys.splice(i,1);
        }
    }

    // make a copy of keys, into sendkeys so can add/remove shift as needed
    let sendkeys : number[] = [];
    let i: number;
    for (i = 0; i < keys.length; ++i)
        sendkeys[i] = keys[i];

    //console.log(keys.toString());

    for (i = 0; i < sendkeys.length; ++i) {
        let left = sendkeys.indexOf(15);
        let right = sendkeys.indexOf(52);
        let scancode = sendkeys[i];
        if ((scancode & 256) != 0 && left < 0 && right < 0)
        {
            sendkeys.unshift(15);
            sendkeys[++i] -= 256;
        }
        if (scancode & 512) {
            if (left >= 0) {
                sendkeys.splice(left, 1);
                if (left <= i)
                    --i;
            }
            if (right >= 0) {
                sendkeys.splice(right, 1);
                if (left <= i)
                    --i;
            }
            sendkeys[i] -= 512;
        }
    }

    //console.log(sendkeys.toString());
    cpuWorker.postMessage({ keys: sendkeys.toString() });

    // const log : HTMLElement | null = document.getElementById("log");
    // if (log)
    //     log.innerHTML = keys.toString();

    if (scan != 64)
    {
      event.preventDefault(); // disable all keys default actions (as allowed by OS and user agent)
      event.stopPropagation();  
    }
    return false;
}

// c64-main-ui.ts - Commodore 64 display drawing
//
////////////////////////////////////////////////////////////////////////////////
//
// simple-emu-c64
// C64/6502 Emulator for Microsoft Windows Console
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

var canvas: any = document.getElementById("screen");
var ctx = canvas?.getContext("2d");
ctx.fillStyle = "#000000";
ctx.fillRect(0, 0, 320, 200);

var about_img: HTMLImageElement = new Image();
var about_loaded: boolean = false;
var about_active: boolean = false;
about_img.addEventListener("load", function() { 
    ctx.drawImage(about_img, 0,0);
    about_loaded = true;
  }, false);
about_img.src = "emuc64-about.png";

function toggleAbout() {
  if (about_active) {
    about_active = false;
    drawC64Screen();
  } else {
    about_active = true;
    ctx.drawImage(about_img, 0,0);
  }
}

function canvasClick(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  if (about_active)
    window.open("https://github.com/davervw/ts-emu-c64/blob/master/README.md");
  else
    toggleAbout();
}

var w: Worker | undefined; // worker

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
    };
    return true;
  } else {
    var result: HTMLElement | null = document.getElementById("result");
    if (result != null)
      result.innerHTML = "Sorry, your browser does not support Web Workers...";
  }
  return false;
}

if (startWorker() && w != null) // start worker
{
  w.postMessage({ basic: c64_basic_rom, char: c64_char_rom, kernal: c64_kernal_rom });
  let c64keys = new C64keymapper(w); // start keyboard driver
}

// c64-draw.ts - Commodore 64 display drawing
//
////////////////////////////////////////////////////////////////////////////////
//
// simple-emu-c64
// C64/6502 Emulator for Microsoft Windows Console
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

let C64colors: number[][] = [
  [0, 0, 0, 255],       // [0] black
  [255, 255, 255, 255], // [1] white
  [192, 0, 0, 255],     // [2] red
  [0, 255, 255, 255],   // [3] cyan
  [160, 32, 160, 255],  // [4] purple
  [32, 160, 32, 255],   // [5] green
  [64, 64, 192, 255],   // [6] blue
  [255, 255, 128, 255], // [7] yellow
  [255, 128, 0, 255],   // [8] orange
  [128, 64, 0, 255],    // [9] brown  
  [192, 32, 32, 255],   // [10] lt red
  [64, 64, 64, 255],    // [11] dk gray
  [128, 128, 128, 255], // [12] med gray
  [160, 255, 160, 255], // [13] lt green
  [128, 128, 255, 255], // [14] lt blue
  [192, 192, 192, 255], // [15] lt gray
];

function toHex(value: number, digits: number): string {
  let s: string = value.toString(16).toUpperCase();
  while (s.length < digits)
    s = "0" + s;
  return s;
}

function toHex8(value: number): string {
  return toHex(value, 2);
}

function drawC64Screen(){
  cpuWorker.postMessage({ redraw: true });
}

function drawC64Border(canvas: HTMLElement, color: number) {
  color = color & 0xF;
  let rgb = C64colors[color];
  canvas.style.borderColor = "#" + toHex8(rgb[0]) + toHex8(rgb[1]) + toHex8(rgb[2]);
}

function drawC64Char(ctx: CanvasRenderingContext2D, chardata: number[], x: number, y: number, fg: number, bg: number) {
  var char: ImageData = new ImageData(8, 8);
  var b: number;
  var r: number;

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
// simple-emu-c64
// C64/6502 Emulator for Microsoft Windows Console
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

function dropHandler(ev: any) {
  console.log('File(s) dropped');

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();

  if (ev.dataTransfer.items) {
    // Use DataTransferItemList interface to access the file(s)
    for (var i = 0; i < ev.dataTransfer.items.length; i++) {
      // If dropped items aren't files, reject them
      if (ev.dataTransfer.items[i].kind === 'file') {
        var file = ev.dataTransfer.items[i].getAsFile();
        console.log('... file[' + i + '].name = ' + file.name);
      }
    }
  } else {
    // Use DataTransfer interface to access the file(s)
    for (var i = 0; i < ev.dataTransfer.files.length; i++) {
      console.log('... file[' + i + '].name = ' + ev.dataTransfer.files[i].name);
    }
  }
}

function dragOverHandler(ev: any) {
  console.log('File(s) in drop zone'); 

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();
}