"use strict";
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
let keyCodeToCBMScan = [
    [
        64, 64, 64, 64, 64, 64, 64, 64, 0, 58,
        64, 64, 64, 1, 64, 64, 15, 61, 61, 63,
        2048 + 64, 64, 64, 64, 64, 64, 64, 63, 64, 64,
        64, 64, 60, 1024 + 64, 64, 64, 51, 256 + 2, 256 + 7, 2,
        7, 64, 64, 64, 64, 256 + 0, 0, 64, 35, 56,
        59, 8, 11, 16, 19, 24, 27, 32, 64, 50,
        64, 53, 64, 64, 64, 10, 28, 20, 18, 14,
        21, 26, 29, 33, 34, 37, 42, 36, 39, 38,
        41, 62, 17, 13, 22, 30, 31, 9, 23, 25,
        12, 64, 64, 64, 64, 64, 35, 56, 59, 8,
        11, 16, 19, 24, 27, 32, 49, 40, 64, 43,
        44, 55, 4, 256 + 4, 5, 256 + 5, 6, 256 + 6, 3, 256 + 3,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 43, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 50, 53, 47, 43,
        44, 55, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 256 + 45,
        48, 256 + 50, 256 + 24, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64 // 250: na, na, na, na, na, na
    ],
    [
        64, 64, 64, 64, 64, 64, 64, 64, 0, 58,
        64, 64, 64, 1, 64, 64, 15, 61, 61, 63,
        2048 + 64, 64, 64, 64, 64, 64, 64, 63, 64, 64,
        64, 64, 60, 1024 + 64, 64, 64, 51, 256 + 2, 256 + 7, 2,
        7, 64, 64, 64, 64, 256 + 0, 0, 64, 32, 56,
        512 + 46, 8, 11, 16, 512 + 54, 19, 512 + 49, 27, 64, 512 + 45,
        64, 512 + 40, 64, 64, 64, 10, 28, 20, 18, 14,
        21, 26, 29, 33, 34, 37, 42, 36, 39, 38,
        38, 62, 17, 13, 22, 30, 31, 9, 23, 25,
        12, 64, 64, 64, 64, 64, 512 + 35, 512 + 56, 512 + 59, 512 + 8,
        512 + 11, 512 + 16, 512 + 19, 512 + 24, 512 + 27, 512 + 32, 512 + 49, 512 + 40, 64, 512 + 43,
        512 + 44, 512 + 55, 512 + 4, 4, 512 + 5, 5, 512 + 6, 6, 512 + 3, 3,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 512 + 57, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 512 + 45, 512 + 40, 47, 512 + 57,
        44, 55, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 45,
        48, 50, 59, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
        64, 64, 64, 64, 64, 64 // 250: na, na, na, na, na, na
    ],
];
let keys = [];
let cpuWorker;
class C64keymapper {
    constructor(worker) {
        document.addEventListener("keydown", C64keyEvent);
        document.addEventListener("keyup", C64keyEvent);
        cpuWorker = worker;
    }
}
function C64keyEvent(event) {
    //console.log(event);
    let modifiers = (event.metaKey ? '1' : '0') + (event.altKey ? '1' : '0') + (event.ctrlKey ? '1' : '0') + (event.shiftKey ? '1' : '0');
    let scan = keyCodeToCBMScan[event.shiftKey ? 1 : 0][event.keyCode];
    if (event.code == "ShiftRight") // differentiate Right from Left for Commodore
        scan = 52; // Right Shift
    //let msg = event.type + " " + event.keyCode + " " + event.code + " " + event.key + " " + modifiers + " " + scan;
    //console.log(msg);
    // scan = (scan & 255);
    if (event.type == "keydown") {
        if (scan != 64 && keys.indexOf(scan) < 0)
            keys.push(scan);
    }
    else if (event.type == "keyup") {
        let i = keys.indexOf(scan);
        if (i < 0 && !event.shiftKey) // did we get keyup for unshifted version of keydown?  keyCode wouldn't match
            i = keys.indexOf(keyCodeToCBMScan[1][event.keyCode]);
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
    }
    // make a copy of keys, into sendkeys so can add/remove shift as needed
    let sendkeys = [];
    let i;
    for (i = 0; i < keys.length; ++i)
        sendkeys[i] = keys[i];
    //console.log(keys.toString());
    for (i = 0; i < sendkeys.length; ++i) {
        let left = sendkeys.indexOf(15);
        let right = sendkeys.indexOf(52);
        let scancode = sendkeys[i];
        if ((scancode & 256) != 0 && left < 0 && right < 0) {
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
    cpuWorker.postMessage(sendkeys.toString());
    // const log : HTMLElement | null = document.getElementById("log");
    // if (log)
    //     log.innerHTML = keys.toString();
    event.preventDefault(); // disable all keys default actions (as allowed by OS and user agent)          
    event.stopPropagation();
    return false;
}
//# sourceMappingURL=c64-kbd.js.map