"use strict";
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
function drawC64Border(canvas, color) {
    color = color & 0xF;
    let rgb = C64colors[color];
    canvas.style.borderColor = "#" + toHex8(rgb[0]) + toHex8(rgb[1]) + toHex8(rgb[2]);
}
function drawC64Char(ctx, chardata, x, y, fg, bg) {
    var char = new ImageData(8, 8);
    var b;
    var r;
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
//# sourceMappingURL=c64-draw.js.map