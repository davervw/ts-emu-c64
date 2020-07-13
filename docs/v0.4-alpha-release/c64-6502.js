"use strict";
// emu6502.ts - class Emu6502 - MOS6502 Emulator
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let scancodes_queue = []; // queue of string, each is comma separated list of scan codes
let scancodes_irq = []; // array of scan codes, used for full IRQ cycle
let basic_rom = [];
let char_rom = [];
let kernal_rom = [];
let redraw_screen = true;
let autoexec = new Uint8Array(0);
class Emu6502 {
    constructor(memory, execute, context) {
        this.A = 0;
        this.X = 0;
        this.Y = 0;
        this.S = 0xFF;
        this.N = false;
        this.V = false;
        this.B = false;
        this.D = false;
        this.I = false;
        this.Z = false;
        this.C = false;
        this.PC = 0;
        this.trace_count = 0;
        this.trace = false;
        this.step = false;
        this.exit = false;
        this.yield = false;
        this.roms_loaded = false;
        this.memory = memory;
        this.execute = execute;
        this.context = context;
        this.breakpoints = [];
    }
    ResetRun() {
        return __awaiter(this, void 0, void 0, function* () {
            // wait for ROMs
            while (!this.roms_loaded) {
                let missing_roms = false;
                if (kernal_rom.length != 8192)
                    missing_roms = true;
                if (basic_rom.length != 8192)
                    missing_roms = true;
                if (char_rom.length != 4096)
                    missing_roms = true;
                if (missing_roms) {
                    console.log("waiting a second for Commodore ROMs...");
                    yield new Promise(r => setTimeout(r, 1000));
                }
                else
                    this.roms_loaded = true;
            }
            let addr = (this.memory.get(0xFFFC) | (this.memory.get(0xFFFD) << 8)); // JMP(RESET)
            this.Execute(addr);
        });
    }
    Walk(addrs) {
        var walker = new Walk6502();
        if (addrs.length == 0)
            walker.Walk(this, this.memory.get(0xFFFC) | (this.memory.get(0xFFFD) << 8));
        else {
            let i;
            for (i = 0; i < addrs.length; ++i)
                walker.Walk(this, addrs[i]);
        }
    }
    static toHex(value, digits) {
        let s = value.toString(16).toUpperCase();
        while (s.length < digits)
            s = "0" + s;
        return s;
    }
    static toHex8(value) {
        return Emu6502.toHex(value, 2);
    }
    static toHex16(value) {
        return Emu6502.toHex(value, 4);
    }
    getNextScanCodes() {
        if (scancodes_queue.length > 0) {
            let s = scancodes_queue.shift();
            if (s == null || s.length == 0)
                scancodes_irq = [];
            else
                scancodes_irq = s.split(',');
        }
        // else keep same ones going, either still pressed or not pressed
    }
    Execute(addr) {
        return __awaiter(this, void 0, void 0, function* () {
            let conditional;
            let bytes;
            let interrupt_time = (1 / 60) * 1000; // 60 times per second, converted to milliseconds
            let timer_then = Date.now();
            this.PC = addr;
            while (true) {
                while (true) {
                    let timer_read = Date.now();
                    if (!this.I && (timer_read - timer_then) >= interrupt_time) // IRQ
                     {
                        this.getNextScanCodes(); // each IRQ gets new buffered scan codes to help guarantee keystrokes get through
                        timer_then = timer_read;
                        this.Push(this.HI(this.PC));
                        this.Push(this.LO(this.PC));
                        this.PHP();
                        this.I = true;
                        this.PC = this.memory.get(0xFFFE) | (this.memory.get(0xFFFF) << 8);
                    }
                    if (this.exit)
                        return;
                    bytes = 1;
                    let breakpoint = false;
                    if (this.breakpoints.indexOf(this.PC) >= 0)
                        breakpoint = true;
                    if (this.trace || breakpoint || this.step) {
                        let addr2;
                        let line;
                        let dis;
                        [dis, conditional, bytes, addr2, line] = this.Disassemble_Long(this.PC);
                        while (line.length < 30)
                            line += ' ';
                        let state = this.GetDisplayState();
                        console.log(line + state);
                        if (this.step)
                            debugger;
                        if (breakpoint)
                            debugger;
                    }
                    if (this.execute != null && !this.execute(this.context)) // allow execute to be overriden at a specific address
                        break;
                }
                this.yield = false;
                switch (this.memory.get(this.PC)) {
                    case 0x00:
                        this.BRK();
                        bytes = 0;
                        break;
                    case 0x01:
                        this.ORA(this.GetIndX());
                        bytes = 2;
                        break;
                    case 0x05:
                        this.ORA(this.GetZP());
                        bytes = 2;
                        break;
                    case 0x06:
                        this.SetZP(this.ASL(this.GetZP()));
                        bytes = 2;
                        break;
                    case 0x08:
                        this.PHP();
                        break;
                    case 0x09:
                        this.ORA(this.GetIM());
                        bytes = 2;
                        break;
                    case 0x0A:
                        this.SetA(this.ASL(this.A));
                        break;
                    case 0x0D:
                        this.ORA(this.GetABS());
                        bytes = 3;
                        break;
                    case 0x0E:
                        this.SetABS(this.ASL(this.GetABS()));
                        bytes = 3;
                        break;
                    case 0x10:
                        this.BPL();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0x11:
                        this.ORA(this.GetIndY());
                        bytes = 2;
                        break;
                    case 0x15:
                        this.ORA(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0x16:
                        this.SetZPX(this.ASL(this.GetZPX()));
                        bytes = 2;
                        break;
                    case 0x18:
                        this.CLC();
                        break;
                    case 0x19:
                        this.ORA(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0x1D:
                        this.ORA(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0x1E:
                        this.SetABSX(this.ASL(this.GetABSX()));
                        bytes = 3;
                        break;
                    case 0x20:
                        this.JSR();
                        bytes = 0;
                        break;
                    case 0x21:
                        this.AND(this.GetIndX());
                        bytes = 2;
                        break;
                    case 0x24:
                        this.BIT(this.GetZP());
                        bytes = 2;
                        break;
                    case 0x25:
                        this.AND(this.GetZP());
                        bytes = 2;
                        break;
                    case 0x26:
                        this.SetZP(this.ROL(this.GetZP()));
                        bytes = 2;
                        break;
                    case 0x28:
                        this.PLP();
                        break;
                    case 0x29:
                        this.AND(this.GetIM());
                        bytes = 2;
                        break;
                    case 0x2A:
                        this.SetA(this.ROL(this.A));
                        break;
                    case 0x2C:
                        this.BIT(this.GetABS());
                        bytes = 3;
                        break;
                    case 0x2D:
                        this.AND(this.GetABS());
                        bytes = 3;
                        break;
                    case 0x2E:
                        this.ROL(this.GetABS());
                        bytes = 3;
                        break;
                    case 0x30:
                        this.BMI();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0x31:
                        this.AND(this.GetIndY());
                        bytes = 2;
                        break;
                    case 0x35:
                        this.AND(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0x36:
                        this.SetZPX(this.ROL(this.GetZPX()));
                        bytes = 2;
                        break;
                    case 0x38:
                        this.SEC();
                        break;
                    case 0x39:
                        this.AND(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0x3D:
                        this.AND(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0x3E:
                        this.SetABSX(this.ROL(this.GetABSX()));
                        bytes = 3;
                        break;
                    case 0x40:
                        this.RTI();
                        bytes = 0;
                        break;
                    case 0x41:
                        this.EOR(this.GetIndX());
                        bytes = 2;
                        break;
                    case 0x45:
                        this.EOR(this.GetZP());
                        bytes = 2;
                        break;
                    case 0x46:
                        this.SetZP(this.LSR(this.GetZP()));
                        bytes = 2;
                        break;
                    case 0x48:
                        this.PHA();
                        break;
                    case 0x49:
                        this.EOR(this.GetIM());
                        bytes = 2;
                        break;
                    case 0x4A:
                        this.SetA(this.LSR(this.A));
                        break;
                    case 0x4C:
                        this.JMP();
                        bytes = 0;
                        break;
                    case 0x4D:
                        this.EOR(this.GetABS());
                        bytes = 3;
                        break;
                    case 0x4E:
                        this.LSR(this.GetABS());
                        bytes = 3;
                        break;
                    case 0x50:
                        this.BVC();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0x51:
                        this.EOR(this.GetIndY());
                        bytes = 2;
                        break;
                    case 0x55:
                        this.EOR(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0x56:
                        this.SetZPX(this.LSR(this.GetZPX()));
                        bytes = 2;
                        break;
                    case 0x58:
                        this.CLI();
                        break;
                    case 0x59:
                        this.EOR(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0x5D:
                        this.EOR(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0x5E:
                        this.SetABSX(this.LSR(this.GetABSX()));
                        bytes = 3;
                        break;
                    case 0x60:
                        this.RTS();
                        bytes = 0;
                        break;
                    case 0x61:
                        this.ADC(this.GetIndX());
                        bytes = 2;
                        break;
                    case 0x65:
                        this.ADC(this.GetZP());
                        bytes = 2;
                        break;
                    case 0x66:
                        this.SetZP(this.ROR(this.GetZP()));
                        bytes = 2;
                        break;
                    case 0x68:
                        this.PLA();
                        break;
                    case 0x69:
                        this.ADC(this.GetIM());
                        bytes = 2;
                        break;
                    case 0x6A:
                        this.SetA(this.ROR(this.A));
                        break;
                    case 0x6C:
                        this.JMPIND();
                        bytes = 0;
                        break;
                    case 0x6D:
                        this.ADC(this.GetABS());
                        bytes = 3;
                        break;
                    case 0x6E:
                        this.SetABS(this.ROR(this.GetABS()));
                        bytes = 3;
                        break;
                    case 0x70:
                        this.BVS();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0x71:
                        this.ADC(this.GetIndY());
                        bytes = 2;
                        break;
                    case 0x75:
                        this.ADC(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0x76:
                        this.SetZPX(this.ROR(this.GetZPX()));
                        bytes = 2;
                        break;
                    case 0x78:
                        this.SEI();
                        break;
                    case 0x79:
                        this.ADC(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0x7D:
                        this.ADC(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0x7E:
                        this.SetABSX(this.ROR(this.GetABSX()));
                        bytes = 3;
                        break;
                    case 0x81:
                        this.SetIndX(this.A);
                        bytes = 2;
                        break;
                    case 0x84:
                        this.SetZP(this.Y);
                        bytes = 2;
                        break;
                    case 0x85:
                        this.SetZP(this.A);
                        bytes = 2;
                        break;
                    case 0x86:
                        this.SetZP(this.X);
                        bytes = 2;
                        break;
                    case 0x88:
                        this.DEY();
                        break;
                    case 0x8A:
                        this.TXA();
                        break;
                    case 0x8C:
                        this.SetABS(this.Y);
                        bytes = 3;
                        break;
                    case 0x8D:
                        this.SetABS(this.A);
                        bytes = 3;
                        break;
                    case 0x8E:
                        this.SetABS(this.X);
                        bytes = 3;
                        break;
                    case 0x90:
                        this.BCC();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0x91:
                        this.SetIndY(this.A);
                        bytes = 2;
                        break;
                    case 0x94:
                        this.SetZPX(this.Y);
                        bytes = 2;
                        break;
                    case 0x95:
                        this.SetZPX(this.A);
                        bytes = 2;
                        break;
                    case 0x96:
                        this.SetZPY(this.X);
                        bytes = 2;
                        break;
                    case 0x98:
                        this.TYA();
                        break;
                    case 0x99:
                        this.SetABSY(this.A);
                        bytes = 3;
                        break;
                    case 0x9A:
                        this.TXS();
                        break;
                    case 0x9D:
                        this.SetABSX(this.A);
                        bytes = 3;
                        break;
                    case 0xA0:
                        this.SetY(this.GetIM());
                        bytes = 2;
                        break;
                    case 0xA1:
                        this.SetA(this.GetIndX());
                        bytes = 2;
                        break;
                    case 0xA2:
                        this.SetX(this.GetIM());
                        bytes = 2;
                        break;
                    case 0xA4:
                        this.SetY(this.GetZP());
                        bytes = 2;
                        break;
                    case 0xA5:
                        this.SetA(this.GetZP());
                        bytes = 2;
                        break;
                    case 0xA6:
                        this.SetX(this.GetZP());
                        bytes = 2;
                        break;
                    case 0xA8:
                        this.TAY();
                        break;
                    case 0xA9:
                        this.SetA(this.GetIM());
                        bytes = 2;
                        break;
                    case 0xAA:
                        this.TAX();
                        break;
                    case 0xAC:
                        this.SetY(this.GetABS());
                        bytes = 3;
                        break;
                    case 0xAD:
                        this.SetA(this.GetABS());
                        bytes = 3;
                        break;
                    case 0xAE:
                        this.SetX(this.GetABS());
                        bytes = 3;
                        break;
                    case 0xB0:
                        this.BCS();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0xB1:
                        this.SetA(this.GetIndY());
                        bytes = 2;
                        break;
                    case 0xB4:
                        this.SetY(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0xB5:
                        this.SetA(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0xB6:
                        this.SetX(this.GetZPY());
                        bytes = 2;
                        break;
                    case 0xB8:
                        this.CLV();
                        break;
                    case 0xB9:
                        this.SetA(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0xBA:
                        this.TSX();
                        break;
                    case 0xBC:
                        this.SetY(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0xBD:
                        this.SetA(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0xBE:
                        this.SetX(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0xC0:
                        this.CPY(this.GetIM());
                        bytes = 2;
                        break;
                    case 0xC1:
                        this.CMP(this.GetIndX());
                        bytes = 2;
                        break;
                    case 0xC4:
                        this.CPY(this.GetZP());
                        bytes = 2;
                        break;
                    case 0xC5:
                        this.CMP(this.GetZP());
                        bytes = 2;
                        break;
                    case 0xC6:
                        this.SetZP(this.DEC(this.GetZP()));
                        bytes = 2;
                        break;
                    case 0xC8:
                        this.INY();
                        break;
                    case 0xC9:
                        this.CMP(this.GetIM());
                        bytes = 2;
                        break;
                    case 0xCA:
                        this.DEX();
                        break;
                    case 0xCC:
                        this.CPY(this.GetABS());
                        bytes = 3;
                        break;
                    case 0xCD:
                        this.CMP(this.GetABS());
                        bytes = 3;
                        break;
                    case 0xCE:
                        this.SetABS(this.DEC(this.GetABS()));
                        bytes = 3;
                        break;
                    case 0xD0:
                        this.BNE();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0xD1:
                        this.CMP(this.GetIndY());
                        bytes = 2;
                        break;
                    case 0xD5:
                        this.CMP(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0xD6:
                        this.SetZPX(this.DEC(this.GetZPX()));
                        bytes = 2;
                        break;
                    case 0xD8:
                        this.CLD();
                        break;
                    case 0xD9:
                        this.CMP(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0xDD:
                        this.CMP(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0xDE:
                        this.SetABSX(this.DEC(this.GetABSX()));
                        bytes = 3;
                        break;
                    case 0xE0:
                        this.CPX(this.GetIM());
                        bytes = 2;
                        break;
                    case 0xE1:
                        this.SBC(this.GetIndX());
                        bytes = 2;
                        break;
                    case 0xE4:
                        this.CPX(this.GetZP());
                        bytes = 2;
                        break;
                    case 0xE5:
                        this.SBC(this.GetZP());
                        bytes = 2;
                        break;
                    case 0xE6:
                        this.SetZP(this.INC(this.GetZP()));
                        bytes = 2;
                        break;
                    case 0xE8:
                        this.INX();
                        break;
                    case 0xE9:
                        this.SBC(this.GetIM());
                        bytes = 2;
                        break;
                    case 0xEA:
                        this.NOP();
                        break;
                    case 0xEC:
                        this.CPX(this.GetABS());
                        bytes = 3;
                        break;
                    case 0xED:
                        this.SBC(this.GetABS());
                        bytes = 3;
                        break;
                    case 0xEE:
                        this.SetABS(this.INC(this.GetABS()));
                        bytes = 3;
                        break;
                    case 0xF0:
                        this.BEQ();
                        conditional = true;
                        bytes = 0;
                        break;
                    case 0xF1:
                        this.SBC(this.GetIndY());
                        bytes = 2;
                        break;
                    case 0xF5:
                        this.SBC(this.GetZPX());
                        bytes = 2;
                        break;
                    case 0xF6:
                        this.SetZPX(this.INC(this.GetZPX()));
                        bytes = 2;
                        break;
                    case 0xF8:
                        this.SED();
                        break;
                    case 0xF9:
                        this.SBC(this.GetABSY());
                        bytes = 3;
                        break;
                    case 0xFD:
                        this.SBC(this.GetABSX());
                        bytes = 3;
                        break;
                    case 0xFE:
                        this.SetABSX(this.INC(this.GetABSX()));
                        bytes = 3;
                        break;
                    default:
                        throw new Error("Invalid opcode " + this.memory.get(this.PC) + " at " + this.PC);
                }
                this.PC = (this.PC + bytes) & 0xFFFF;
                if (this.yield)
                    yield new Promise(r => setTimeout(r, 0));
            }
        });
    }
    // https://javascript.info/task/delay-promise
    // async delay(ms : number) {
    //     return new Promise(resolve => setTimeout(resolve, ms));
    // }
    CMP(value) {
        this.Subtract(this.A, value);
    }
    CPX(value) {
        this.Subtract(this.X, value);
    }
    CPY(value) {
        this.Subtract(this.Y, value);
    }
    SBC(value) {
        if (this.D) {
            let A_dec = (this.A & 0xF) + ((this.A >> 4) * 10);
            let value_dec = (value & 0xF) + ((value >> 4) * 10);
            let result_dec = A_dec - value_dec - (this.C ? 0 : 1);
            this.C = (result_dec >= 0);
            if (!this.C)
                result_dec = -result_dec; // absolute value
            let result = (result_dec % 10) | (((result_dec / 10) % 10) << 4);
            this.SetA(result);
            this.N = false; // undefined?
            this.V = false; // undefined?
        }
        else {
            let overflow = [this.V];
            let result = this.Subtract(this.A, value, overflow);
            this.V = overflow[0];
            this.SetA(result);
        }
    }
    Subtract(reg, value, overflow) {
        if (overflow == null)
            this.C = true; // init for CMP, etc.
        let old_reg_neg = (reg & 0x80) != 0;
        let value_neg = (value & 0x80) != 0;
        let result = reg - value - (this.C ? 0 : 1);
        this.N = (result & 0x80) != 0;
        this.C = (result >= 0);
        this.Z = (result == 0);
        let result_neg = (result & 0x80) != 0;
        if (overflow != null)
            overflow[0] = (old_reg_neg && !value_neg && !result_neg) // neg - pos = pos
                || (!old_reg_neg && value_neg && result_neg); // pos - neg = neg
        return result;
    }
    ADC(value) {
        let result;
        if (this.D) {
            let A_dec = (this.A & 0xF) + ((this.A >> 4) * 10);
            let value_dec = (value & 0xF) + ((value >> 4) * 10);
            let result_dec = A_dec + value_dec + (this.C ? 1 : 0);
            this.C = (result_dec > 99);
            result = (result_dec % 10) | (((result_dec / 10) % 10) << 4);
            this.SetA(result);
            this.Z = (result_dec == 0); // BCD quirk -- 100 doesn't set Z
            this.V = false;
        }
        else {
            let A_old_neg = (this.A & 0x80) != 0;
            let value_neg = (value & 0x80) != 0;
            let result = this.A + value + (this.C ? 1 : 0);
            this.C = (result & 0x100) != 0;
            this.SetA(result);
            let result_neg = (result & 0x80) != 0;
            this.V = (!A_old_neg && !value_neg && result_neg) // pos + pos = neg: overflow
                || (A_old_neg && value_neg && !result_neg); // neg + neg = pos: overflow
        }
    }
    ORA(value) {
        this.SetA(this.A | value);
    }
    EOR(value) {
        this.SetA(this.A ^ value);
    }
    AND(value) {
        this.SetA(this.A & value);
    }
    BIT(value) {
        this.Z = (this.A & value) == 0;
        this.N = (value & 0x80) != 0;
        this.V = (value & 0x40) != 0;
    }
    ASL(value) {
        this.C = (value & 0x80) != 0;
        value = (value << 1) & 0xFF;
        this.Z = (value == 0);
        this.N = (value & 0x80) != 0;
        return value;
    }
    LSR(value) {
        this.C = (value & 0x01) != 0;
        value = (value >> 1);
        this.Z = (value == 0);
        this.N = false;
        return value;
    }
    ROL(value) {
        let newC = (value & 0x80) != 0;
        value = ((value << 1) & 0xFF) | (this.C ? 1 : 0);
        this.C = newC;
        this.Z = (value == 0);
        this.N = (value & 0x80) != 0;
        return value;
    }
    ROR(value) {
        let newC = (value & 0x01) != 0;
        this.N = this.C;
        value = ((value >> 1) | (this.C ? 0x80 : 0));
        this.C = newC;
        this.Z = (value == 0);
        return value;
    }
    Push(value) {
        this.memory.set(0x100 | this.S, value);
        this.S = (this.S - 1) & 0xFF;
    }
    Pop() {
        this.S = (this.S + 1) & 0xFF;
        return this.memory.get(0x100 | this.S);
    }
    PHP() {
        let flags = (this.N ? 0x80 : 0)
            | (this.V ? 0x40 : 0)
            | (this.B ? 0x10 : 0)
            | (this.D ? 0x08 : 0)
            | (this.I ? 0x04 : 0)
            | (this.Z ? 0x02 : 0)
            | (this.C ? 0x01 : 0);
        this.Push(flags);
    }
    PLP() {
        let flags = this.Pop();
        this.N = (flags & 0x80) != 0;
        this.V = (flags & 0x40) != 0;
        this.B = (flags & 0x10) != 0;
        this.D = (flags & 0x08) != 0;
        this.I = (flags & 0x04) != 0;
        this.Z = (flags & 0x02) != 0;
        this.C = (flags & 0x01) != 0;
    }
    PHA() {
        this.Push(this.A);
    }
    PLA() {
        this.SetA(this.Pop());
    }
    CLC() {
        this.C = false;
    }
    CLD() {
        this.D = false;
    }
    CLI() {
        this.I = false;
    }
    CLV() {
        this.V = false;
    }
    SEC() {
        this.C = true;
    }
    SED() {
        this.D = true;
    }
    SEI() {
        this.I = true;
    }
    INX() {
        this.X = this.INC(this.X);
    }
    INY() {
        this.Y = this.INC(this.Y);
    }
    DEX() {
        this.X = this.DEC(this.X);
    }
    DEY() {
        this.Y = this.DEC(this.Y);
    }
    NOP() {
        // do nothing operation
    }
    DEC(value) {
        value = (value - 1) & 0xFF;
        this.Z = (value == 0);
        this.N = (value & 0x80) != 0;
        return value;
    }
    INC(value) {
        value = (value + 1) & 0xFF;
        this.Z = (value == 0);
        this.N = (value & 0x80) != 0;
        return value;
    }
    TXA() {
        this.A = this.SetReg(this.X);
    }
    TAX() {
        this.X = this.SetReg(this.A);
    }
    TYA() {
        this.A = this.SetReg(this.Y);
    }
    TAY() {
        this.Y = this.SetReg(this.A);
    }
    TXS() {
        this.S = this.X;
    }
    TSX() {
        this.X = this.SetReg(this.S);
    }
    BR(branch) {
        let addr2 = this.GetBR();
        if (branch)
            this.PC = addr2;
        else
            this.PC = this.IncWord(this.PC + 1); // safer +2
    }
    BPL() {
        this.BR(!this.N);
    }
    BMI() {
        this.BR(this.N);
    }
    BCC() {
        this.BR(!this.C);
    }
    BCS() {
        this.BR(this.C);
    }
    BVC() {
        this.BR(!this.V);
    }
    BVS() {
        this.BR(this.V);
    }
    BNE() {
        this.BR(!this.Z);
    }
    BEQ() {
        this.BR(this.Z);
    }
    JSR() {
        let addr2 = this.IncWord(this.PC + 1); // safer than +2
        this.Push(this.HI(addr2));
        this.Push(this.LO(addr2));
        this.PC = this.GetNextWord(this.PC);
    }
    RTS() {
        let lo = this.Pop();
        let hi = this.Pop();
        this.PC = this.IncWord((hi << 8) | lo);
    }
    RTI() {
        this.PLP();
        let lo = this.Pop();
        let hi = this.Pop();
        this.PC = ((hi << 8) | lo);
    }
    BRK() {
        this.PC = this.IncWord(this.PC);
        this.Push(this.HI(this.PC));
        this.Push(this.LO(this.PC));
        this.PHP();
        this.B = true;
        this.PC = this.memory.get(0xFFFE) | (this.memory.get(0xFFFF) << 8); // JMP(IRQ)
    }
    JMP() {
        this.PC = this.GetNextWord(this.PC);
    }
    JMPIND() {
        let addr2 = this.GetNextWord(this.PC);
        if ((addr2 & 0xFF) == 0xFF) // JMP($XXFF) won't go over page boundary
            this.PC = (this.memory.get(addr2) | (this.memory.get(addr2 - 0xFF) << 8)); // 6502 "bug" - will use XXFF and XX00 as source of address
        else
            this.PC = this.memory.get(addr2) | (this.memory.get(addr2 + 1) << 8); // note: IncWord not necessary 'cause already checked for overflow
    }
    SetA(value) {
        this.A = this.SetReg(value);
    }
    SetX(value) {
        this.X = this.SetReg(value);
    }
    SetY(value) {
        this.Y = this.SetReg(value);
    }
    SetReg(value) {
        value = value & 0xFF; // truncate to byte
        this.Z = (value == 0);
        this.N = ((value & 0x80) != 0);
        return value;
    }
    GetIndX() {
        let addr2 = (this.memory.get(this.IncWord(this.PC)) + this.X) & 0xFF; // compute ZP address using offset
        let addr3 = this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8); // stay in ZP
        return this.memory.get(addr3);
    }
    SetIndX(value) {
        let addr2 = (this.memory.get(this.IncWord(this.PC)) + this.X) & 0xFF; // compute ZP address using offset
        let addr3 = this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8); // stay in ZP
        this.memory.set(addr3, value);
    }
    GetIndY() {
        let addr2 = this.memory.get(this.IncWord(this.PC)); // get ZP address
        let addr3 = (this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8)) + this.Y; // keep source in ZP, add offset
        return this.memory.get(addr3);
    }
    SetIndY(value) {
        let addr2 = this.memory.get(this.IncWord(this.PC)); // get ZP address
        let addr3 = (this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8)) + this.Y; // keep source in ZP, add offset
        this.memory.set(addr3, value);
    }
    GetZP() {
        let addr2 = this.memory.get(this.IncWord(this.PC));
        return this.memory.get(addr2);
    }
    SetZP(value) {
        let addr2 = this.memory.get(this.IncWord(this.PC));
        this.memory.set(addr2, value);
    }
    GetZPX() {
        let addr2 = this.memory.get(this.IncWord(this.PC));
        return this.memory.get((addr2 + this.X) & 0xFF);
    }
    SetZPX(value) {
        let addr2 = this.memory.get(this.IncWord(this.PC));
        this.memory.set((addr2 + this.X) & 0xFF, value);
    }
    GetZPY() {
        let addr2 = this.memory.get(this.IncWord(this.PC));
        return this.memory.get((addr2 + this.Y) & 0xFF);
    }
    SetZPY(value) {
        let addr2 = this.memory.get(this.IncWord(this.PC));
        this.memory.set((addr2 + this.Y) & 0xFF, value);
    }
    GetABS() {
        let addr2 = this.GetNextWord(this.PC);
        let value = this.memory.get(addr2);
        if (addr2 == 0xDC01) // keyboard scan read
            this.yield = true;
        return value;
    }
    SetABS(value) {
        let addr2 = this.GetNextWord(this.PC);
        this.memory.set(addr2, value);
    }
    GetABSX() {
        let addr2 = (this.GetNextWord(this.PC) + this.X) & 0xFFFF;
        return this.memory.get(addr2);
    }
    SetABSX(value) {
        let addr2 = (this.GetNextWord(this.PC) + this.X) & 0xFFFF;
        this.memory.set(addr2, value);
    }
    GetABSY() {
        let addr2 = (this.GetNextWord(this.PC) + this.Y) & 0xFFFF;
        return this.memory.get(addr2);
    }
    SetABSY(value) {
        let addr2 = (this.GetNextWord(this.PC) + this.Y) & 0xFFFF;
        this.memory.set(addr2, value);
    }
    GetIM() {
        return this.memory.get(this.IncWord(this.PC));
    }
    GetBR() {
        let offset = this.sbyte(this.memory.get(this.IncWord(this.PC)));
        return (this.PC + 2 + offset) & 0xFFFF;
    }
    sbyte(value) {
        value &= 0xFF; // force to byte
        if (value & 0x80)
            return -((value ^ 0xFF) + 1); // signed byte is negative -128..-1
        else
            return value; // signed byte is non-negative 0..127
    }
    IncWord(value) {
        return (value + 1) & 0xFFFF;
    }
    GetNextWord(addr) {
        let addr1 = this.IncWord(addr);
        let addr2 = this.IncWord(addr1);
        return (this.memory.get(addr1) | (this.memory.get(addr2) << 8));
    }
    LO(value) {
        return value & 0xFF; // low byte
    }
    HI(value) {
        return (value >> 8) & 0xFF; // high byte
    }
    GetDisplayState() {
        return "A:" + Emu6502.toHex8(this.A) +
            " X:" + Emu6502.toHex8(this.X) +
            " Y:" + Emu6502.toHex8(this.Y) +
            " S:" + Emu6502.toHex8(this.S) +
            " P:" +
            (this.N ? 'N' : ' ') +
            (this.V ? 'V' : ' ') +
            '-' +
            (this.B ? 'B' : ' ') +
            (this.D ? 'D' : ' ') +
            (this.I ? 'I' : ' ') +
            (this.Z ? 'Z' : ' ') +
            (this.C ? 'C' : ' ');
    }
    Disassemble_Long(addr) {
        let dis;
        let conditional;
        let bytes;
        let addr2;
        let line;
        [dis, conditional, bytes, addr2] = this.Disassemble_Short(addr);
        let s = "";
        s += Emu6502.toHex16(addr) + " ";
        let i;
        for (i = 0; i < 3; ++i) {
            if (i < bytes)
                s += Emu6502.toHex8(this.memory.get(addr + i)) + " ";
            else
                s += "   ";
        }
        s += dis;
        line = s;
        return [dis, conditional, bytes, addr2, line];
    }
    Disassemble_Short(addr) {
        let conditional = false;
        let bytes = 1;
        let addr2 = 0;
        let dis;
        switch (this.memory.get(addr)) {
            case 0x00:
                dis = "BRK";
                break;
            case 0x01:
                [dis, bytes] = this.DisIndX("ORA", addr);
                break;
            case 0x05:
                [dis, bytes] = this.DisZP("ORA", addr);
                break;
            case 0x06:
                [dis, bytes] = this.DisZP("ASL", addr);
                break;
            case 0x08:
                dis = "PHP";
                break;
            case 0x09:
                [dis, bytes] = this.DisIM("ORA", addr);
                break;
            case 0x0A:
                dis = "ASL A";
                break;
            case 0x0D:
                [dis, bytes] = this.DisABS("ORA", addr);
                break;
            case 0x0E:
                [dis, bytes] = this.DisABS("ASL", addr);
                break;
            case 0x10:
                [dis, conditional, addr2, bytes] = this.DisBR("BPL", addr);
                break;
            case 0x11:
                [dis, bytes] = this.DisIndY("ORA", addr);
                break;
            case 0x15:
                [dis, bytes] = this.DisZPX("ORA", addr);
                break;
            case 0x16:
                [dis, bytes] = this.DisZPX("ASL", addr);
                break;
            case 0x18:
                dis = "CLC";
                break;
            case 0x19:
                [dis, bytes] = this.DisABSY("ORA", addr);
                break;
            case 0x1D:
                [dis, bytes] = this.DisABSX("ORA", addr);
                break;
            case 0x1E:
                [dis, bytes] = this.DisABSX("ASL", addr);
                break;
            case 0x20:
                [dis, addr2, bytes] = this.DisABSAddr("JSR", addr);
                break;
            case 0x21:
                [dis, bytes] = this.DisIndX("AND", addr);
                break;
            case 0x24:
                [dis, bytes] = this.DisZP("BIT", addr);
                break;
            case 0x25:
                [dis, bytes] = this.DisZP("AND", addr);
                break;
            case 0x26:
                [dis, bytes] = this.DisZP("ROL", addr);
                break;
            case 0x28:
                dis = "PLP";
                break;
            case 0x29:
                [dis, bytes] = this.DisIM("AND", addr);
                break;
            case 0x2A:
                dis = "ROL A";
                break;
            case 0x2C:
                [dis, bytes] = this.DisABS("BIT", addr);
                break;
            case 0x2D:
                [dis, bytes] = this.DisABS("AND", addr);
                break;
            case 0x2E:
                [dis, bytes] = this.DisABS("ROL", addr);
                break;
            case 0x30:
                [dis, conditional, addr2, bytes] = this.DisBR("BMI", addr);
                break;
            case 0x31:
                [dis, bytes] = this.DisIndY("AND", addr);
                break;
            case 0x35:
                [dis, bytes] = this.DisZPX("AND", addr);
                break;
            case 0x36:
                [dis, bytes] = this.DisZPX("ROL", addr);
                break;
            case 0x38:
                dis = "SEC";
                break;
            case 0x39:
                [dis, bytes] = this.DisABSY("AND", addr);
                break;
            case 0x3D:
                [dis, bytes] = this.DisABSX("AND", addr);
                break;
            case 0x3E:
                [dis, bytes] = this.DisABSX("ROL", addr);
                break;
            case 0x40:
                dis = "RTI";
                break;
            case 0x41:
                [dis, bytes] = this.DisIndX("EOR", addr);
                break;
            case 0x45:
                [dis, bytes] = this.DisZP("EOR", addr);
                break;
            case 0x46:
                [dis, bytes] = this.DisZP("LSR", addr);
                break;
            case 0x48:
                dis = "PHA";
                break;
            case 0x49:
                [dis, bytes] = this.DisIM("EOR", addr);
                break;
            case 0x4A:
                dis = "LSR A";
                break;
            case 0x4C:
                [dis, addr2, bytes] = this.DisABSAddr("JMP", addr);
                break;
            case 0x4D:
                [dis, bytes] = this.DisABS("EOR", addr);
                break;
            case 0x4E:
                [dis, bytes] = this.DisABS("LSR", addr);
                break;
            case 0x50:
                [dis, conditional, addr2, bytes] = this.DisBR("BVC", addr);
                break;
            case 0x51:
                [dis, bytes] = this.DisIndY("EOR", addr);
                break;
            case 0x55:
                [dis, bytes] = this.DisZPX("EOR", addr);
                break;
            case 0x56:
                [dis, bytes] = this.DisZPX("LSR", addr);
                break;
            case 0x58:
                dis = "CLI";
                break;
            case 0x59:
                [dis, bytes] = this.DisABSY("EOR", addr);
                break;
            case 0x5D:
                [dis, bytes] = this.DisABSX("EOR", addr);
                break;
            case 0x5E:
                [dis, bytes] = this.DisABSX("LSR", addr);
                break;
            case 0x60:
                dis = "RTS";
                break;
            case 0x61:
                [dis, bytes] = this.DisIndX("ADC", addr);
                break;
            case 0x65:
                [dis, bytes] = this.DisZP("ADC", addr);
                break;
            case 0x66:
                [dis, bytes] = this.DisZP("ROR", addr);
                break;
            case 0x68:
                dis = "PLA";
                break;
            case 0x69:
                [dis, bytes] = this.DisIM("ADC", addr);
                break;
            case 0x6A:
                dis = "ROR A";
                break;
            case 0x6C:
                [dis, addr2, bytes] = this.DisInd("JMP", addr);
                break;
            case 0x6D:
                [dis, bytes] = this.DisABS("ADC", addr);
                break;
            case 0x6E:
                [dis, bytes] = this.DisABS("ROR", addr);
                break;
            case 0x70:
                [dis, conditional, addr2, bytes] = this.DisBR("BVS", addr);
                break;
            case 0x71:
                [dis, bytes] = this.DisIndY("ADC", addr);
                break;
            case 0x75:
                [dis, bytes] = this.DisZPX("ADC", addr);
                break;
            case 0x76:
                [dis, bytes] = this.DisZPX("ROR", addr);
                break;
            case 0x78:
                dis = "SEI";
                break;
            case 0x79:
                [dis, bytes] = this.DisABSY("ADC", addr);
                break;
            case 0x7D:
                [dis, bytes] = this.DisABSX("ADC", addr);
                break;
            case 0x7E:
                [dis, bytes] = this.DisABSX("ROR", addr);
                break;
            case 0x81:
                [dis, bytes] = this.DisIndX("STA", addr);
                break;
            case 0x84:
                [dis, bytes] = this.DisZP("STY", addr);
                break;
            case 0x85:
                [dis, bytes] = this.DisZP("STA", addr);
                break;
            case 0x86:
                [dis, bytes] = this.DisZP("STX", addr);
                break;
            case 0x88:
                dis = "DEY";
                break;
            case 0x8A:
                dis = "TXA";
                break;
            case 0x8C:
                [dis, bytes] = this.DisABS("STY", addr);
                break;
            case 0x8D:
                [dis, bytes] = this.DisABS("STA", addr);
                break;
            case 0x8E:
                [dis, bytes] = this.DisABS("STX", addr);
                break;
            case 0x90:
                [dis, conditional, addr2, bytes] = this.DisBR("BCC", addr);
                break;
            case 0x91:
                [dis, bytes] = this.DisIndY("STA", addr);
                break;
            case 0x94:
                [dis, bytes] = this.DisZPX("STY", addr);
                break;
            case 0x95:
                [dis, bytes] = this.DisZPX("STA", addr);
                break;
            case 0x96:
                [dis, bytes] = this.DisZPY("STX", addr);
                break;
            case 0x98:
                dis = "TYA";
                break;
            case 0x99:
                [dis, bytes] = this.DisABSY("STA", addr);
                break;
            case 0x9A:
                dis = "TXS";
                break;
            case 0x9D:
                [dis, bytes] = this.DisABSX("STA", addr);
                break;
            case 0xA0:
                [dis, bytes] = this.DisIM("LDY", addr);
                break;
            case 0xA1:
                [dis, bytes] = this.DisIndX("LDA", addr);
                break;
            case 0xA2:
                [dis, bytes] = this.DisIM("LDX", addr);
                break;
            case 0xA4:
                [dis, bytes] = this.DisZP("LDY", addr);
                break;
            case 0xA5:
                [dis, bytes] = this.DisZP("LDA", addr);
                break;
            case 0xA6:
                [dis, bytes] = this.DisZP("LDX", addr);
                break;
            case 0xA8:
                dis = "TAY";
                break;
            case 0xA9:
                [dis, bytes] = this.DisIM("LDA", addr);
                break;
            case 0xAA:
                dis = "TAX";
                break;
            case 0xAC:
                [dis, bytes] = this.DisABS("LDY", addr);
                break;
            case 0xAD:
                [dis, bytes] = this.DisABS("LDA", addr);
                break;
            case 0xAE:
                [dis, bytes] = this.DisABS("LDX", addr);
                break;
            case 0xB0:
                [dis, conditional, addr2, bytes] = this.DisBR("BCS", addr);
                break;
            case 0xB1:
                [dis, bytes] = this.DisIndY("LDA", addr);
                break;
            case 0xB4:
                [dis, bytes] = this.DisZPX("LDY", addr);
                break;
            case 0xB5:
                [dis, bytes] = this.DisZPX("LDA", addr);
                break;
            case 0xB6:
                [dis, bytes] = this.DisZPY("LDX", addr);
                break;
            case 0xB8:
                dis = "CLV";
                break;
            case 0xB9:
                [dis, bytes] = this.DisABSY("LDA", addr);
                break;
            case 0xBA:
                dis = "TSX";
                break;
            case 0xBC:
                [dis, bytes] = this.DisABSX("LDY", addr);
                break;
            case 0xBD:
                [dis, bytes] = this.DisABSX("LDA", addr);
                break;
            case 0xBE:
                [dis, bytes] = this.DisABSY("LDX", addr);
                break;
            case 0xC0:
                [dis, bytes] = this.DisIM("CPY", addr);
                break;
            case 0xC1:
                [dis, bytes] = this.DisIndX("CMP", addr);
                break;
            case 0xC4:
                [dis, bytes] = this.DisZP("CPY", addr);
                break;
            case 0xC5:
                [dis, bytes] = this.DisZP("CMP", addr);
                break;
            case 0xC6:
                [dis, bytes] = this.DisZP("DEC", addr);
                break;
            case 0xC8:
                dis = "INY";
                break;
            case 0xC9:
                [dis, bytes] = this.DisIM("CMP", addr);
                break;
            case 0xCA:
                dis = "DEX";
                break;
            case 0xCC:
                [dis, bytes] = this.DisABS("CPY", addr);
                break;
            case 0xCD:
                [dis, bytes] = this.DisABS("CMP", addr);
                break;
            case 0xCE:
                [dis, bytes] = this.DisABS("DEC", addr);
                break;
            case 0xD0:
                [dis, conditional, addr2, bytes] = this.DisBR("BNE", addr);
                break;
            case 0xD1:
                [dis, bytes] = this.DisIndY("CMP", addr);
                break;
            case 0xD5:
                [dis, bytes] = this.DisZPX("CMP", addr);
                break;
            case 0xD6:
                [dis, bytes] = this.DisZPX("DEC", addr);
                break;
            case 0xD8:
                dis = "CLD";
                break;
            case 0xD9:
                [dis, bytes] = this.DisABSY("CMP", addr);
                break;
            case 0xDD:
                [dis, bytes] = this.DisABSX("CMP", addr);
                break;
            case 0xDE:
                [dis, bytes] = this.DisABSX("DEC", addr);
                break;
            case 0xE0:
                [dis, bytes] = this.DisIM("CPX", addr);
                break;
            case 0xE1:
                [dis, bytes] = this.DisIndX("SBC", addr);
                break;
            case 0xE4:
                [dis, bytes] = this.DisZP("CPX", addr);
                break;
            case 0xE5:
                [dis, bytes] = this.DisZP("SBC", addr);
                break;
            case 0xE6:
                [dis, bytes] = this.DisZP("INC", addr);
                break;
            case 0xE8:
                dis = "INX";
                break;
            case 0xE9:
                [dis, bytes] = this.DisIM("SBC", addr);
                break;
            case 0xEA:
                dis = "NOP";
                break;
            case 0xEC:
                [dis, bytes] = this.DisABS("CPX", addr);
                break;
            case 0xED:
                [dis, bytes] = this.DisABS("SBC", addr);
                break;
            case 0xEE:
                [dis, bytes] = this.DisABS("INC", addr);
                break;
            case 0xF0:
                [dis, conditional, addr2, bytes] = this.DisBR("BEQ", addr);
                break;
            case 0xF1:
                [dis, bytes] = this.DisIndY("SBC", addr);
                break;
            case 0xF5:
                [dis, bytes] = this.DisZPX("SBC", addr);
                break;
            case 0xF6:
                [dis, bytes] = this.DisZPX("INC", addr);
                break;
            case 0xF8:
                dis = "SED";
                break;
            case 0xF9:
                [dis, bytes] = this.DisABSY("SBC", addr);
                break;
            case 0xFD:
                [dis, bytes] = this.DisABSX("SBC", addr);
                break;
            case 0xFE:
                [dis, bytes] = this.DisABSX("INC", addr);
                break;
            default:
                dis = "???";
                break;
            //throw new Exception(string.Format("Invalid opcode {0:X2}", this.memory.get(addr]));
        }
        return [dis, conditional, bytes, addr2];
    }
    DisInd(opcode, addr) {
        let bytes = 3;
        let addr1 = this.GetNextWord(addr);
        let addr2 = this.memory.get(addr1) | (this.memory.get(this.IncWord(addr1)) << 8);
        let dis = opcode + " ($" + Emu6502.toHex16(addr1) + ")";
        return [dis, addr2, bytes];
    }
    DisIndX(opcode, addr) {
        let bytes = 2;
        let dis = opcode + " ($" + Emu6502.toHex8(this.memory.get(addr + 1)) + ",X)";
        return [dis, bytes];
    }
    DisIndY(opcode, addr) {
        let bytes = 2;
        let dis = opcode + " ($" + Emu6502.toHex8(this.memory.get(addr + 1)) + "),Y";
        return [dis, bytes];
    }
    DisZP(opcode, addr) {
        let bytes = 2;
        let dis = opcode + " $" + Emu6502.toHex8(this.memory.get(addr + 1));
        return [dis, bytes];
    }
    DisZPX(opcode, addr) {
        let bytes = 2;
        let dis = opcode + " $" + Emu6502.toHex8(this.memory.get(addr + 1)) + ",X";
        return [dis, bytes];
    }
    DisZPY(opcode, addr) {
        let bytes = 2;
        let dis = opcode + " $" + Emu6502.toHex8(this.memory.get(addr + 1)) + ",Y";
        return [dis, bytes];
    }
    DisABS(opcode, addr) {
        let bytes = 3;
        let dis = opcode + " $" + Emu6502.toHex16(this.GetNextWord(addr));
        return [dis, bytes];
    }
    DisABSAddr(opcode, addr) {
        let bytes = 3;
        let addr2 = this.GetNextWord(addr);
        let dis = opcode + " $" + Emu6502.toHex16(addr2);
        return [dis, addr2, bytes];
    }
    DisABSX(opcode, addr) {
        let bytes = 3;
        let dis = opcode + " $" + Emu6502.toHex16(this.GetNextWord(addr)) + ",X";
        return [dis, bytes];
    }
    DisABSY(opcode, addr) {
        let bytes = 3;
        let dis = opcode + " $" + Emu6502.toHex16(this.GetNextWord(addr)) + ",Y";
        return [dis, bytes];
    }
    DisIM(opcode, addr) {
        let bytes = 2;
        let dis = opcode + " #$" + Emu6502.toHex8(this.memory.get(addr + 1));
        return [dis, bytes];
    }
    DisBR(opcode, addr) {
        let bytes = 2;
        let conditional = true;
        let offset = this.sbyte(this.memory.get(addr + 1));
        let addr2 = (addr + 2 + offset);
        let dis = opcode + " $" + Emu6502.toHex16(addr2);
        return [dis, conditional, addr2, bytes];
    }
}
// emuc64.ts - Class EmuC64 - Commodore 64 Emulator
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
//
// This is a 6502 Emulator, designed for running Commodore 64 text mode, 
//   with only a few hooks, and limited memory mapped I/O,
//   and implemented RAM/ROM/IO banking (BASIC could live without these)
//   READY hook is used to load program specified on command line
//
//   $00         (data direction missing)
//   $01         Banking implemented (tape sense/controls missing)
//   $0000-$9FFF RAM (upper limit may vary based on RAM allocated)
//   $A000-$BFFF BASIC ROM
//   $A000-$BFFF Banked LORAM (may not be present based on RAM allocated)
//   $C000-$CFFF RAM
//   $D000-$D7FF (most I/O missing, reads as zeros)
//   $D018       VIC-II Chip Memory Control Register (e.g. graphics vs. lowercase characters)
//   $D020-$D021 screen border, background
//   $D800-$D9FF VIC-II color RAM nybbles in I/O space (1K x 4bits)
//   $DA00-$DFFF (more I/O space mostly missing, reads as zeros)
//   $DC00-$DC01 keyboard I/O
//   $D000-$DFFF Banked RAM (may not be present based on RAM allocated)
//   $D000-$DFFF Banked Character ROM
//   $E000-$FFFF KERNAL ROM
//   $E000-$FFFF Banked HIRAM (may not be present based on RAM allocated)
//
////////////////////////////////////////////////////////////////////////////////
class C64Memory {
    constructor(ram_size, plotter) {
        // note ram starts at 0x0000
        this.basic_addr = 0xA000;
        this.kernal_addr = 0xE000;
        this.io_addr = 0xD000;
        this.io_size = 0x1000;
        this.color_addr = 0xD800;
        this.color_size = 0x0400;
        this.open_addr = 0xC000;
        this.open_size = 0x1000;
        this.plotter = plotter;
        if (ram_size > 64 * 1024)
            ram_size = 64 * 1024;
        this.ram = [];
        let i;
        for (i = 0; i < ram_size; ++i)
            this.ram.push(0);
        this.io = [];
        for (i = 0; i < this.io_size; ++i)
            this.io.push(0);
        this.io[0xC01] = 0xFF; // Data Port B - so by default keyboard returns no key perssed
        // initialize DDR and memory mapping to defaults
        this.ram[0] = 0xEF;
        this.ram[1] = 0x07;
    }
    get(addr) {
        if (redraw_screen) {
            this.redrawScreen();
            redraw_screen = false;
        }
        if (addr <= this.ram.length - 1 // note: handles option to have less than 64K RAM
            && (addr < this.basic_addr // always RAM
                || (addr >= this.open_addr && addr < this.open_addr + this.open_size) // always open RAM C000.CFFF
                || (((this.ram[1] & 3) != 3) && addr >= this.basic_addr && addr < this.basic_addr + basic_rom.length) // RAM banked instead of BASIC
                || (((this.ram[1] & 2) == 0) && addr >= this.kernal_addr && addr <= this.kernal_addr + kernal_rom.length - 1) // RAM banked instead of KERNAL
                || (((this.ram[1] & 3) == 0) && addr >= this.io_addr && addr < this.io_addr + this.io.length) // RAM banked instead of IO
            ))
            return this.ram[addr];
        else if (addr >= this.basic_addr && addr < this.basic_addr + basic_rom.length)
            return basic_rom[addr - this.basic_addr];
        else if (addr >= this.io_addr && addr < this.io_addr + this.io.length) {
            if ((this.ram[1] & 4) == 0)
                return char_rom[addr - this.io_addr];
            else if (addr >= this.color_addr && addr < this.color_addr + this.color_size)
                return this.io[addr - this.io_addr] | 0xF0; // set high bits to show this is a nybble
            else if (addr == 0xDC01) // read keyboard data row for matching column
             {
                let value = 0;
                let i = 0;
                for (i = 0; i < scancodes_irq.length; ++i) {
                    let scancode = parseInt(scancodes_irq[i]);
                    if (scancode < 64) {
                        let col = Math.floor(scancode / 8);
                        let row = scancode % 8;
                        if ((this.io[0xC00] & (1 << col)) == 0)
                            value |= (1 << row);
                    }
                }
                return value ^ 0xFF;
            }
            else
                return this.io[addr - this.io_addr];
        }
        else if (addr >= this.kernal_addr && addr <= this.kernal_addr + kernal_rom.length - 1)
            return kernal_rom[addr - this.kernal_addr];
        else
            return 0xFF;
    }
    upperLower() {
        return (this.io[0x18] & 2) != 0;
    }
    set(addr, value) {
        if (addr <= this.ram.length - 1 // note: handles option to have less than 64K RAM
            && (addr < this.io_addr // RAM, including open RAM, and RAM under BASIC
                || (addr >= this.kernal_addr && addr <= this.kernal_addr + kernal_rom.length - 1) // RAM under KERNAL
                || (((this.ram[1] & 7) == 0) && addr >= this.io_addr && addr < this.io_addr + this.io.length) // RAM banked in instead of IO
            )) {
            if (this.ram[addr] != value) {
                this.ram[addr] = value; // banked RAM, and RAM under ROM
                if (addr >= 1024 && addr < 2024) // screen memory // TODO: check registers
                 {
                    let offset = addr - 1024;
                    let col = offset % 40;
                    let row = Math.floor(offset / 40);
                    this.plotter.draw(value, this.upperLower(), col * 8, row * 8, this.io[0x800 + offset], this.io[0x21]); // char, x, y, fg, bg
                }
            }
        }
        else if (addr == 0xD020) { // border
            value = value & 0xF; // only lower 4 bits are stored 0..15
            if (this.io[addr - this.io_addr] != value) {
                this.io[addr - this.io_addr] = value; // store value so can be retrieved
                this.plotter.border(value);
            }
        }
        else if (addr == 0xD021) { // background
            value = value & 0xF; // only lower 4 bits are stored 0..15
            if (this.io[addr - this.io_addr] != value) {
                this.io[addr - this.io_addr] = value; // store value so can be retrieved
                this.redrawScreen();
            }
        }
        else if (addr >= this.color_addr && addr < this.color_addr + this.color_size) {
            if (this.io[addr - this.io_addr] != value) {
                this.io[addr - this.io_addr] = value;
                let offset = addr - this.color_addr;
                if (offset < 1000) { // screen memory // TODO: check registers
                    let col = offset % 40;
                    let row = Math.floor(offset / 40);
                    this.plotter.draw(this.ram[1024 + offset], this.upperLower(), col * 8, row * 8, value, this.io[0x21]); // char x, y, fg, bg
                }
            }
        }
        else if (addr == 0xDC00) // write keyboard scan column
            this.io[addr - this.io_addr] = value;
        else if (addr == 0xD018) { // VIC-II Chip Memory Control Register
            this.io[addr - this.io_addr] = value;
            this.redrawScreen(); // upper to lower or lower to upper
        }
    }
    redrawScreen() {
        let addr;
        let bg = this.io[0x21];
        let mixedcase = this.upperLower();
        // redraw screen
        for (addr = 1024; addr < 2024; ++addr) {
            let offset = addr - 1024;
            let col = offset % 40;
            let row = Math.floor(offset / 40);
            this.plotter.draw(this.ram[addr], mixedcase, col * 8, row * 8, this.io[0x800 + offset], bg); // char, x, y, fg, bg
        }
    }
    getWorker() {
        return this.plotter.getWorker();
    }
}
class EmuC64 {
    constructor(ram_size, plotter) {
        this.FileName = "";
        this.FileNum = 0;
        this.FileDev = 0;
        this.FileSec = 0;
        this.FileVerify = false;
        this.FileAddr = 0;
        this.LOAD_TRAP = -1;
        this.startup_state = 0;
        this.StartupPRG = "";
        this.memory = new C64Memory(ram_size, plotter);
        this.cpu = new Emu6502(this.memory, this.ExecutePatch, this);
        this.plotter = plotter;
    }
    ResetRun() {
        return __awaiter(this, void 0, void 0, function* () {
            this.cpu.ResetRun();
        });
    }
    // C64 patches
    //   34/35 ($22/$23) = INDEX, temporary BASIC pointer, set before CLR
    //   43/44 = start of BASIC program in RAM
    //   45/46 = end of BASIC program in RAM, start of variables
    //   $A474 = ROM BASIC READY prompt
    //   $A47B = ROM BASIC MAIN, in direct mode but skip READY prompt
    //   $A533 = ROM LNKPRG/LINKPRG
    //   $A65E = CLEAR/CLR - erase variables
    //   $A815 = EXECUTE after parsing GO token
    //   $AD8A = Evaluate expression, check data type
    //   $B7F7 = Convert floating point to 2 byte integer Y/A
    ExecutePatch(context) {
        if (context.StartupPRG == "" && autoexec.length > 0) {
            context.StartupPRG = "AUTOEXEC";
            context.cpu.PC = (context.memory.get(0xFFFC) | (context.memory.get(0xFFFD) << 8)); // JMP(RESET)
            return true;
        }
        if (context.cpu.PC == 0xFFBA) // SETLFS
         {
            context.FileNum = context.cpu.A;
            context.FileDev = context.cpu.X;
            context.FileSec = context.cpu.Y;
            console.log("SETLFS " + context.FileNum + ", " + context.FileDev + ", " + context.FileSec);
        }
        else if (context.cpu.PC == 0xFFBD) // SETNAM
         {
            let name = "";
            let addr = context.cpu.X | (context.cpu.Y << 8);
            let i;
            for (i = 0; i < context.cpu.A; ++i)
                name += String.fromCharCode(context.memory.get(addr + i)).toString();
            console.log("SETNAM " + name);
            context.FileName = name;
        }
        else if (context.cpu.PC == 0xFFD5) // LOAD
         {
            context.FileAddr = context.cpu.X | (context.cpu.Y << 8);
            let op;
            if (context.cpu.A == 0)
                op = "LOAD";
            else if (context.cpu.A == 1)
                op = "VERIFY";
            else
                op = "LOAD (A=" + context.cpu.A + ") ???";
            context.FileVerify = (context.cpu.A == 1);
            console.log(op + " @" + Emu6502.toHex16(context.FileAddr));
            context.ExecuteRTS();
            if (context.cpu.A == 0 || context.cpu.A == 1) {
                context.StartupPRG = context.FileName;
                context.FileName = "";
                context.LOAD_TRAP = context.cpu.PC;
                // Set success
                context.cpu.C = false;
            }
            else {
                context.cpu.SetA(14); // ILLEGAL QUANTITY message
                context.cpu.C = true; // failure
            }
            return true; // overriden, and PC changed, so caller should reloop before execution to allow breakpoint/trace/ExecutePatch/etc.
        }
        else if (context.cpu.PC == 0xFFD8) // SAVE
         {
            let addr1 = context.memory.get(context.cpu.A) | (context.memory.get((context.cpu.A + 1) & 0xFF) << 8);
            let addr2 = context.cpu.X | (context.cpu.Y << 8);
            console.log("SAVE " + Emu6502.toHex16(addr1) + "-" + Emu6502.toHex16(addr2));
            // Set success
            context.cpu.C = !context.FileSave(context.FileName, addr1, addr2);
            return context.ExecuteRTS();
        }
        // else if (context.cpu.PC == 0xa7e4 && !context.cpu.trace) // execute statement
        // {
        //     context.cpu.trace = true;
        //     return true; // call again, so traces this line
        // } 
        else if (context.cpu.PC == 0xA474 || context.cpu.PC == context.LOAD_TRAP) // READY
         {
            // context.cpu.trace = false;
            if (context.StartupPRG != "") // User requested program be loaded at startup
             {
                let is_basic;
                if (context.cpu.PC == context.LOAD_TRAP) {
                    is_basic = (context.FileVerify == false
                        && context.FileSec == 0 // relative load, not absolute
                        && context.cpu.LO(context.FileAddr) == context.memory.get(43) // requested load address matches BASIC start
                        && context.cpu.HI(context.FileAddr) == context.memory.get(44));
                    let success;
                    let err;
                    [success, err] = context.FileLoad();
                    if (!success) {
                        console.log("FileLoad() failed: err=" + err + ", file " + context.StartupPRG);
                        context.cpu.C = true; // signal error
                        context.cpu.SetA(err); // FILE NOT FOUND or VERIFY
                        // so doesn't repeat
                        context.StartupPRG = "";
                        context.LOAD_TRAP = -1;
                        autoexec = new Uint8Array(0);
                        return true; // overriden, and PC changed, so caller should reloop before execution to allow breakpoint/trace/ExecutePatch/etc.
                    }
                }
                else {
                    context.FileName = context.StartupPRG;
                    context.FileAddr = context.memory.get(43) | (context.memory.get(44) << 8);
                    is_basic = context.LoadStartupPrg();
                }
                context.StartupPRG = "";
                autoexec = new Uint8Array(0);
                if (is_basic) {
                    // UNNEW that I used in late 1980s, should work well for loading a program too, probably gleaned from BASIC ROM
                    // listed here as reference, adapted to use in this state machine, ExecutePatch()
                    // ldy #0
                    // lda #1
                    // sta(43),y
                    // iny
                    // sta(43),y
                    // jsr $a533 ; LINKPRG
                    // clc
                    // lda $22
                    // adc #2
                    // sta 45
                    // lda $23
                    // adc #0
                    // sta 46
                    // lda #0
                    // jsr $a65e ; CLEAR/CLR
                    // jmp $a474 ; READY
                    // initialize first couple bytes (may only be necessary for UNNEW?)
                    let addr = context.memory.get(43) | (context.memory.get(44) << 8);
                    context.memory.set(addr, 1);
                    context.memory.set(addr + 1, 1);
                    context.startup_state = 1; // should be able to regain control when returns...
                    return context.ExecuteJSR(0xA533); // LINKPRG
                }
                else {
                    context.LOAD_TRAP = -1;
                    context.cpu.X = context.cpu.LO(context.FileAddr);
                    context.cpu.Y = context.cpu.HI(context.FileAddr);
                    context.cpu.C = false;
                }
            }
            else if (context.startup_state == 1) {
                let addr = context.memory.get(0x22) + (context.memory.get(0x23) << 8) + 2;
                context.memory.set(45, context.cpu.LO(addr));
                context.memory.set(46, context.cpu.HI(addr));
                context.cpu.SetA(0);
                context.startup_state = 2; // should be able to regain control when returns...
                return context.ExecuteJSR(0xA65E); // CLEAR/CLR
            }
            else if (context.startup_state == 2) {
                if (context.cpu.PC == context.LOAD_TRAP) {
                    context.cpu.X = context.cpu.LO(context.FileAddr);
                    context.cpu.Y = context.cpu.HI(context.FileAddr);
                }
                else {
                    // put RUN\r in keyboard buffer
                    context.memory.set(631, "R".charCodeAt(0));
                    context.memory.set(632, "U".charCodeAt(0));
                    context.memory.set(633, "N".charCodeAt(0));
                    context.memory.set(634, 13);
                    context.memory.set(198, 4);
                    context.cpu.PC = 0xA47B; // skip READY message, but still set direct mode, and continue to MAIN
                }
                context.cpu.C = false; // signal success
                context.startup_state = 0;
                context.LOAD_TRAP = -1;
                return true; // overriden, and PC changed, so caller should reloop before execution to allow breakpoint/trace/ExecutePatch/etc.
            }
        }
        return false;
    }
    ExecuteRTS() {
        this.cpu.RTS();
        return true; // return value for ExecutePatch so will reloop execution to allow berakpoint/trace/ExecutePatch/etc.
    }
    ExecuteJSR(addr) {
        let retaddr = (this.cpu.PC - 1) & 0xFFFF;
        this.cpu.Push(this.cpu.HI(retaddr));
        this.cpu.Push(this.cpu.LO(retaddr));
        this.cpu.PC = addr;
        return true; // return value for ExecutePatch so will reloop execution to allow berakpoint/trace/ExecutePatch/etc.
    }
    // returns true if BASIC (and succeeded)
    LoadStartupPrg() {
        let result;
        let err;
        [result, err] = this.FileLoad();
        if (!result)
            return false;
        else
            return this.FileSec == 0 ? true : false; // relative is BASIC, absolute is ML
    }
    OpenRead(filename) {
        if (filename == "AUTOEXEC" && autoexec.length != 0) {
            var file = [];
            let i;
            for (i = 0; i < autoexec.length; ++i)
                file[i] = autoexec[i];
            return file;
        }
        var files = [
            ["LOOP", [0x01, 0x10, 0x0a, 0x10, 0x0a, 0x00, 0x89, 0x20, 0x31, 0x30, 0x00, 0x00, 0x00, 0x00]],
            ["HELLO", [0x01, 0x08, 0x17, 0x08, 0x0a, 0x00, 0x8f, 0x20, 0x48, 0x45, 0x4c, 0x4c, 0x4f, 0x20, 0x43, 0x6f,
                    0x6d, 0x6d, 0x6f, 0x64, 0x6f, 0x72, 0x65, 0x00, 0x32, 0x08, 0x14, 0x00, 0x99, 0x20, 0x22, 0x48,
                    0x45, 0x4c, 0x4c, 0x4f, 0x20, 0x43, 0x6f, 0x6d, 0x6d, 0x6f, 0x64, 0x6f, 0x72, 0x65, 0x21, 0x20,
                    0x22, 0x3b, 0x00, 0x3b, 0x08, 0x1e, 0x00, 0x89, 0x20, 0x32, 0x30, 0x00, 0x00, 0x00, 0x00]],
            ["C64-CHARSET", [0x01, 0x08, 0x11, 0x08, 0x09, 0x00, 0x97, 0x20, 0x35, 0x36, 0x33, 0x33, 0x33, 0x2c, 0x31, 0x32,
                    0x37, 0x00, 0x28, 0x08, 0x0a, 0x00, 0x97, 0x20, 0x31, 0x2c, 0xc2, 0x28, 0x31, 0x29, 0x20, 0xaf,
                    0x20, 0x28, 0x32, 0x35, 0x35, 0xab, 0x34, 0x29, 0x00, 0x30, 0x08, 0x0b, 0x00, 0x41, 0xb2, 0x34,
                    0x00, 0x3e, 0x08, 0x0c, 0x00, 0x99, 0x20, 0xc7, 0x28, 0x31, 0x34, 0x37, 0x29, 0x3b, 0x00, 0x46,
                    0x08, 0x0f, 0x00, 0x43, 0xb2, 0x30, 0x00, 0x54, 0x08, 0x14, 0x00, 0x81, 0x20, 0x49, 0xb2, 0x30,
                    0x20, 0xa4, 0x20, 0x37, 0x00, 0x64, 0x08, 0x1e, 0x00, 0x81, 0x20, 0x4a, 0xb2, 0x30, 0x20, 0xa4,
                    0x20, 0x41, 0xab, 0x31, 0x00, 0x91, 0x08, 0x28, 0x00, 0x56, 0xb2, 0x30, 0x3a, 0x8b, 0x20, 0x43,
                    0xaa, 0x4a, 0x20, 0xb3, 0x20, 0x35, 0x31, 0x32, 0x20, 0xa7, 0x20, 0x56, 0xb2, 0xc2, 0x28, 0x31,
                    0x33, 0xac, 0x34, 0x30, 0x39, 0x36, 0xaa, 0x28, 0x43, 0xaa, 0x4a, 0x29, 0xac, 0x38, 0xaa, 0x49,
                    0x29, 0x00, 0x9b, 0x08, 0x32, 0x00, 0x4d, 0xb2, 0x31, 0x32, 0x38, 0x00, 0xb6, 0x08, 0x3c, 0x00,
                    0x8b, 0x20, 0x28, 0x56, 0x20, 0xaf, 0x20, 0x4d, 0x29, 0x20, 0xb2, 0x20, 0x30, 0x20, 0xa7, 0x20,
                    0x99, 0x20, 0x22, 0x20, 0x22, 0x3b, 0x00, 0xd2, 0x08, 0x46, 0x00, 0x8b, 0x20, 0x28, 0x56, 0x20,
                    0xaf, 0x20, 0x4d, 0x29, 0x20, 0xb3, 0xb1, 0x20, 0x30, 0x20, 0xa7, 0x20, 0x99, 0x20, 0x22, 0x2a,
                    0x22, 0x3b, 0x00, 0xe8, 0x08, 0x4b, 0x00, 0x4d, 0xb2, 0x4d, 0xad, 0x32, 0x3a, 0x8b, 0x20, 0x4d,
                    0xb1, 0xb2, 0x31, 0x20, 0xa7, 0x20, 0x36, 0x30, 0x00, 0xf0, 0x08, 0x50, 0x00, 0x82, 0x20, 0x4a,
                    0x00, 0xf6, 0x08, 0x55, 0x00, 0x99, 0x00, 0xfe, 0x08, 0x5a, 0x00, 0x82, 0x20, 0x49, 0x00, 0x08,
                    0x09, 0x5f, 0x00, 0x43, 0xb2, 0x43, 0xaa, 0x41, 0x00, 0x19, 0x09, 0x60, 0x00, 0x8b, 0x20, 0x43,
                    0xb3, 0x35, 0x31, 0x32, 0x20, 0xa7, 0x20, 0x32, 0x30, 0x00, 0x2a, 0x09, 0x64, 0x00, 0x97, 0x20,
                    0x31, 0x2c, 0xc2, 0x28, 0x31, 0x29, 0x20, 0xb0, 0x20, 0x34, 0x00, 0x3a, 0x09, 0x6e, 0x00, 0x97,
                    0x20, 0x35, 0x36, 0x33, 0x33, 0x33, 0x2c, 0x31, 0x32, 0x39, 0x00, 0x00, 0x00]],
            ["UNNEW700", [0xbc, 0x02, 0xa0, 0x00, 0xa9, 0x01, 0x91, 0x2b, 0xc8, 0x91, 0x2b, 0x20, 0x33, 0xa5, 0x18, 0xa5,
                    0x22, 0x69, 0x02, 0x85, 0x2d, 0xa5, 0x23, 0x69, 0x00, 0x85, 0x2e, 0xa9, 0x00, 0x20, 0x5e, 0xa6,
                    0x4c, 0x74, 0xa4]],
            ["BANKTEST", [0x00, 0xc0, 0x78, 0x20, 0xc3, 0xc0, 0x20, 0x3f, 0xc0, 0xa9, 0xa0, 0x8d, 0x00, 0xa0, 0xa9, 0xc8,
                    0x8d, 0x00, 0xc8, 0xa9, 0x0e, 0x8d, 0x00, 0xd8, 0xa9, 0xe0, 0x8d, 0x00, 0xe0, 0x20, 0x46, 0xc0,
                    0xa9, 0xd8, 0x8d, 0x00, 0xd8, 0x20, 0x3f, 0xc0, 0xa9, 0x00, 0x8d, 0xeb, 0xc0, 0x20, 0x57, 0xc0,
                    0xee, 0xeb, 0xc0, 0xa9, 0x07, 0x2c, 0xeb, 0xc0, 0xf0, 0x02, 0xd0, 0xf1, 0x20, 0x3f, 0xc0, 0x58,
                    0x60, 0xa5, 0x01, 0x09, 0x07, 0x85, 0x01, 0x60, 0xa5, 0x01, 0x29, 0xf8, 0x85, 0x01, 0x60, 0xa5,
                    0x01, 0x29, 0xf8, 0x0d, 0xeb, 0xc0, 0x85, 0x01, 0x60, 0xa9, 0x20, 0x20, 0xd2, 0xff, 0xad, 0xeb,
                    0xc0, 0x20, 0xa3, 0xc0, 0xa9, 0x00, 0xa2, 0xa0, 0x20, 0x84, 0xc0, 0xa9, 0x00, 0xa2, 0xc8, 0x20,
                    0x84, 0xc0, 0xa9, 0x00, 0xa2, 0xd8, 0x20, 0x84, 0xc0, 0xa9, 0x00, 0xa2, 0xe0, 0x20, 0x84, 0xc0,
                    0xa9, 0x0d, 0x20, 0xd2, 0xff, 0x60, 0x85, 0xfb, 0x86, 0xfc, 0xa9, 0x20, 0x20, 0xd2, 0xff, 0x20,
                    0xd2, 0xff, 0x20, 0xd2, 0xff, 0xa0, 0x00, 0x20, 0x4d, 0xc0, 0xb1, 0xfb, 0x48, 0x20, 0x3f, 0xc0,
                    0x68, 0x20, 0xa3, 0xc0, 0x60, 0x48, 0x4a, 0x4a, 0x4a, 0x4a, 0x20, 0xae, 0xc0, 0x68, 0x29, 0x0f,
                    0xc9, 0x10, 0xb0, 0x10, 0xc9, 0x0a, 0xb0, 0x05, 0x69, 0x30, 0x4c, 0xd2, 0xff, 0xe9, 0x0a, 0x69,
                    0x40, 0x4c, 0xd2, 0xff, 0x60, 0xa0, 0x00, 0xb9, 0xd1, 0xc0, 0xf0, 0x06, 0x20, 0xd2, 0xff, 0xc8,
                    0xd0, 0xf5, 0x60, 0x42, 0x41, 0x4e, 0x4b, 0x20, 0x41, 0x30, 0x30, 0x30, 0x20, 0x43, 0x38, 0x30,
                    0x30, 0x20, 0x44, 0x38, 0x30, 0x30, 0x20, 0x45, 0x30, 0x30, 0x30, 0x0d, 0x00, 0x00]],
            ["SPEEDTEST", [0x01, 0x08, 0x12, 0x08, 0x0a, 0x00, 0x54, 0x49, 0x24, 0xb2, 0x22, 0x30, 0x30, 0x30, 0x30, 0x30,
                    0x30, 0x22, 0x00, 0x1c, 0x08, 0x14, 0x00, 0x49, 0xb2, 0x49, 0xaa, 0x31, 0x00, 0x31, 0x08, 0x1e,
                    0x00, 0x8b, 0x54, 0x49, 0x24, 0xb3, 0x22, 0x30, 0x30, 0x30, 0x30, 0x33, 0x30, 0x22, 0xa7, 0x32,
                    0x30, 0x00, 0x52, 0x08, 0x28, 0x00, 0x99, 0x20, 0x49, 0x2c, 0x54, 0x49, 0x24, 0x2c, 0xb5, 0x28,
                    0x49, 0xad, 0x33, 0x34, 0x33, 0x33, 0xac, 0x31, 0x30, 0x30, 0xaa, 0x30, 0x2e, 0x35, 0x29, 0x22,
                    0x25, 0x22, 0x00, 0x00, 0x00, 0x49]],
            ["RANDOM", [0x01, 0x08, 0x0c, 0x08, 0x0a, 0x00, 0x4f, 0xb2, 0x36, 0xac, 0x34, 0x30, 0x00, 0x19, 0x08, 0x14,
                    0x00, 0x53, 0xb2, 0x31, 0x30, 0x32, 0x34, 0xaa, 0x4f, 0x00, 0x2f, 0x08, 0x1e, 0x00, 0x56, 0xb2,
                    0x31, 0x33, 0xac, 0x34, 0x30, 0x39, 0x36, 0xaa, 0x38, 0xac, 0x32, 0x35, 0x36, 0xaa, 0x4f, 0x00,
                    0x39, 0x08, 0x28, 0x00, 0x52, 0xb2, 0x32, 0x35, 0x36, 0x00, 0x46, 0x08, 0x32, 0x00, 0x4e, 0xb2,
                    0x31, 0x30, 0x30, 0x30, 0xab, 0x4f, 0x00, 0x53, 0x08, 0x3c, 0x00, 0x49, 0xb2, 0xbb, 0x28, 0x52,
                    0x29, 0xac, 0x4e, 0x00, 0x63, 0x08, 0x46, 0x00, 0x97, 0x53, 0xaa, 0x49, 0x2c, 0xbb, 0x28, 0x52,
                    0x29, 0xac, 0x52, 0x00, 0x73, 0x08, 0x50, 0x00, 0x97, 0x56, 0xaa, 0x49, 0x2c, 0xbb, 0x28, 0x52,
                    0x29, 0xac, 0x52, 0x00, 0x7b, 0x08, 0x5a, 0x00, 0x89, 0x36, 0x30, 0x00, 0x00, 0x00]],
            ["ABOUT", [0x01, 0x08, 0x13, 0x08, 0x0a, 0x00, 0x42, 0x4f, 0xb2, 0x31, 0x33, 0xac, 0x34, 0x30, 0x39, 0x36,
                    0xaa, 0x33, 0x32, 0x00, 0x25, 0x08, 0x14, 0x00, 0x42, 0x47, 0xb2, 0x31, 0x33, 0xac, 0x34, 0x30,
                    0x39, 0x36, 0xaa, 0x33, 0x33, 0x00, 0x30, 0x08, 0x1e, 0x00, 0x46, 0x47, 0xb2, 0x36, 0x34, 0x36,
                    0x00, 0x3b, 0x08, 0x28, 0x00, 0x97, 0x20, 0x42, 0x4f, 0x2c, 0x36, 0x00, 0x46, 0x08, 0x32, 0x00,
                    0x97, 0x20, 0x42, 0x47, 0x2c, 0x30, 0x00, 0x51, 0x08, 0x3c, 0x00, 0x97, 0x20, 0x46, 0x47, 0x2c,
                    0x31, 0x00, 0x5b, 0x08, 0x46, 0x00, 0x99, 0x20, 0x22, 0x93, 0x22, 0x00, 0x8e, 0x08, 0x50, 0x00,
                    0x99, 0x20, 0x22, 0x20, 0x9e, 0x45, 0x4d, 0x55, 0x43, 0x36, 0x34, 0x2e, 0x44, 0x41, 0x56, 0x45,
                    0x56, 0x57, 0x2e, 0x43, 0x4f, 0x4d, 0x05, 0x20, 0x9a, 0x12, 0x43, 0x4f, 0x4d, 0x4d, 0x4f, 0x44,
                    0x4f, 0x52, 0x45, 0x20, 0x36, 0x34, 0x20, 0x53, 0x55, 0x42, 0x53, 0x45, 0x54, 0x22, 0x00, 0x94,
                    0x08, 0x5a, 0x00, 0x99, 0x00, 0x9e, 0x08, 0x6e, 0x00, 0x99, 0x20, 0x22, 0x05, 0x22, 0x00, 0xce,
                    0x08, 0x78, 0x00, 0x99, 0x20, 0x22, 0x20, 0x43, 0x4c, 0x49, 0x43, 0x4b, 0x3a, 0x20, 0x9f, 0x53,
                    0x52, 0x43, 0x2e, 0x44, 0x41, 0x56, 0x45, 0x56, 0x57, 0x2e, 0x43, 0x4f, 0x4d, 0x05, 0x20, 0x98,
                    0x3e, 0x05, 0x20, 0x54, 0x53, 0x2d, 0x45, 0x4d, 0x55, 0x2d, 0x43, 0x36, 0x34, 0x22, 0x00, 0xef,
                    0x08, 0x82, 0x00, 0x99, 0x20, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x9f, 0xb7,
                    0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0x20, 0x22, 0x00,
                    0xf5, 0x08, 0x87, 0x00, 0x99, 0x00, 0x24, 0x09, 0x8c, 0x00, 0x99, 0x20, 0x22, 0x20, 0x1e, 0x45,
                    0x53, 0x43, 0x98, 0x3d, 0x99, 0x53, 0x54, 0x4f, 0x50, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
                    0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x90, 0x50, 0x47, 0x55, 0x50, 0x3d, 0x52, 0x45, 0x53, 0x54,
                    0x4f, 0x52, 0x45, 0x22, 0x00, 0x54, 0x09, 0xa0, 0x00, 0x99, 0x20, 0x22, 0x20, 0x1e, 0x41, 0x4c,
                    0x54, 0x2f, 0x43, 0x54, 0x52, 0x4c, 0x98, 0x3d, 0x99, 0x43, 0x4f, 0x4d, 0x4d, 0x4f, 0x44, 0x4f,
                    0x52, 0x45, 0x20, 0x20, 0x20, 0x1e, 0x54, 0x41, 0x42, 0x98, 0x3d, 0x99, 0x43, 0x4f, 0x4e, 0x54,
                    0x52, 0x4f, 0x4c, 0x22, 0x00, 0x8b, 0x09, 0xaa, 0x00, 0x99, 0x20, 0x22, 0x20, 0x1e, 0x42, 0x41,
                    0x43, 0x4b, 0x53, 0x50, 0x41, 0x43, 0x45, 0x98, 0x2f, 0x1e, 0x44, 0x45, 0x4c, 0x45, 0x54, 0x45,
                    0x98, 0x3d, 0x99, 0x44, 0x45, 0x4c, 0x20, 0x1e, 0x49, 0x4e, 0x53, 0x98, 0x3d, 0x99, 0x53, 0x48,
                    0x49, 0x46, 0x54, 0x98, 0x2b, 0x99, 0x49, 0x4e, 0x53, 0x54, 0x22, 0x00, 0xbb, 0x09, 0xb4, 0x00,
                    0x99, 0x20, 0x22, 0x20, 0x1e, 0xcd, 0x20, 0x42, 0x41, 0x43, 0x4b, 0x53, 0x4c, 0x41, 0x53, 0x48,
                    0x98, 0x3d, 0x99, 0x5c, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x1e, 0x46, 0x39, 0x05,
                    0x3d, 0x54, 0x48, 0x49, 0x53, 0x20, 0x48, 0x45, 0x4c, 0x50, 0x22, 0x00, 0xc1, 0x09, 0xbe, 0x00,
                    0x99, 0x00, 0xe7, 0x09, 0xc8, 0x00, 0x99, 0x20, 0x22, 0x20, 0x1c, 0x54, 0x45, 0x58, 0x54, 0x20,
                    0x4d, 0x4f, 0x44, 0x45, 0x20, 0x4f, 0x4e, 0x4c, 0x59, 0x2c, 0x20, 0x4e, 0x4f, 0x20, 0x47, 0x52,
                    0x41, 0x50, 0x48, 0x49, 0x43, 0x53, 0x22, 0x00, 0x13, 0x0a, 0xd2, 0x00, 0x99, 0x20, 0x22, 0x20,
                    0x56, 0x45, 0x52, 0x59, 0x20, 0x4c, 0x49, 0x4d, 0x49, 0x54, 0x45, 0x44, 0x20, 0x48, 0x57, 0x20,
                    0x52, 0x45, 0x47, 0x49, 0x53, 0x54, 0x45, 0x52, 0x20, 0x45, 0x4d, 0x55, 0x4c, 0x41, 0x54, 0x49,
                    0x4f, 0x4e, 0x22, 0x00, 0x41, 0x0a, 0xdc, 0x00, 0x99, 0x20, 0x22, 0x20, 0x05, 0x44, 0x52, 0x41,
                    0x47, 0x26, 0x44, 0x52, 0x4f, 0x50, 0x20, 0x54, 0x4f, 0x20, 0x4c, 0x4f, 0x41, 0x44, 0x2c, 0x20,
                    0x53, 0x41, 0x56, 0x45, 0x20, 0x54, 0x4f, 0x20, 0x44, 0x4f, 0x57, 0x4e, 0x4c, 0x4f, 0x41, 0x44,
                    0x22, 0x00, 0x47, 0x0a, 0xe6, 0x00, 0x99, 0x00, 0x73, 0x0a, 0xf0, 0x00, 0x99, 0x20, 0x22, 0x20,
                    0x81, 0x2a, 0x2a, 0x2a, 0x46, 0x49, 0x52, 0x45, 0x46, 0x4f, 0x58, 0x20, 0x42, 0x52, 0x4f, 0x57,
                    0x53, 0x45, 0x52, 0x20, 0x52, 0x45, 0x43, 0x4f, 0x4d, 0x4d, 0x45, 0x4e, 0x44, 0x45, 0x44, 0x2a,
                    0x2a, 0x2a, 0x22, 0x00, 0x79, 0x0a, 0xfa, 0x00, 0x99, 0x00, 0x8c, 0x0a, 0x04, 0x01, 0x99, 0x20,
                    0x22, 0x20, 0x98, 0x4f, 0x50, 0x54, 0x49, 0x4f, 0x4e, 0x53, 0x3a, 0x22, 0x00, 0x92, 0x0a, 0x0e,
                    0x01, 0x99, 0x00, 0xc2, 0x0a, 0x18, 0x01, 0x99, 0x20, 0x22, 0x20, 0x05, 0x12, 0x5b, 0x20, 0x5d,
                    0x92, 0x20, 0x4d, 0x4f, 0x42, 0x49, 0x4c, 0x45, 0x20, 0x4b, 0x45, 0x59, 0x42, 0x4f, 0x41, 0x52,
                    0x44, 0x20, 0x43, 0x4f, 0x4e, 0x54, 0x52, 0x4f, 0x4c, 0x53, 0x20, 0x4e, 0x45, 0x45, 0x44, 0x45,
                    0x44, 0x22, 0x00, 0xc8, 0x0a, 0x22, 0x01, 0x99, 0x00, 0xce, 0x0a, 0x2c, 0x01, 0x99, 0x00, 0xee,
                    0x0a, 0x4a, 0x01, 0x99, 0x20, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
                    0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x12, 0x5b, 0x4f, 0x4b, 0x5d, 0x92, 0x22, 0x00, 0xff,
                    0x0a, 0xe4, 0x03, 0x99, 0x20, 0x22, 0x91, 0x91, 0x91, 0x91, 0x1d, 0x1d, 0x12, 0x22, 0x3b, 0x00,
                    0x12, 0x0b, 0xe5, 0x03, 0xa1, 0x41, 0x24, 0x3a, 0x8b, 0x41, 0x24, 0xb2, 0x22, 0x22, 0xa7, 0x39,
                    0x39, 0x37, 0x00, 0x3c, 0x0b, 0xe6, 0x03, 0x8b, 0x41, 0x24, 0xb2, 0x22, 0x20, 0x22, 0xa7, 0x54,
                    0xb2, 0x31, 0xab, 0x54, 0x3a, 0x99, 0xca, 0x28, 0x22, 0x20, 0x58, 0x22, 0x2c, 0x54, 0xaa, 0x31,
                    0x2c, 0x31, 0x29, 0x22, 0x9d, 0x22, 0x3b, 0x3a, 0x89, 0x39, 0x39, 0x37, 0x00, 0x42, 0x0b, 0xe7,
                    0x03, 0x80, 0x00, 0x00, 0x00, 0x42]],
            ["$", [0x01, 0x08, 0x1a, 0x08, 0xe8, 0x03, 0x12, 0x22, 0x43, 0x36, 0x34, 0x45, 0x4d, 0x55, 0x2e, 0x44,
                    0x41, 0x56, 0x45, 0x56, 0x57, 0x2e, 0x43, 0x4f, 0x4d, 0x22, 0x00, 0x35, 0x08, 0xe9, 0x03, 0x22,
                    0x4c, 0x4f, 0x4f, 0x50, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
                    0x20, 0x20, 0x50, 0x52, 0x47, 0x00, 0x50, 0x08, 0xea, 0x03, 0x22, 0x48, 0x45, 0x4c, 0x4c, 0x4f,
                    0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x50, 0x52, 0x47,
                    0x00, 0x6b, 0x08, 0xeb, 0x03, 0x22, 0x43, 0x36, 0x34, 0x2d, 0x43, 0x48, 0x41, 0x52, 0x53, 0x45,
                    0x54, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x50, 0x52, 0x47, 0x00, 0x86, 0x08, 0xec, 0x03,
                    0x22, 0x55, 0x4e, 0x4e, 0x45, 0x57, 0x37, 0x30, 0x30, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
                    0x20, 0x20, 0x20, 0x50, 0x52, 0x47, 0x00, 0xa1, 0x08, 0xed, 0x03, 0x22, 0x42, 0x41, 0x4e, 0x4b,
                    0x54, 0x45, 0x53, 0x54, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x50, 0x52,
                    0x47, 0x00, 0xbc, 0x08, 0xee, 0x03, 0x22, 0x53, 0x50, 0x45, 0x45, 0x44, 0x54, 0x45, 0x53, 0x54,
                    0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x50, 0x52, 0x47, 0x00, 0xd7, 0x08, 0xef,
                    0x03, 0x22, 0x52, 0x41, 0x4e, 0x44, 0x4f, 0x4d, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
                    0x20, 0x20, 0x20, 0x20, 0x50, 0x52, 0x47, 0x00, 0xf2, 0x08, 0xf0, 0x03, 0x22, 0x41, 0x42, 0x4f,
                    0x55, 0x54, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x50,
                    0x52, 0x47, 0x00, 0x00, 0x00]]
        ];
        var i;
        for (i = 0; i < files.length; ++i) {
            if (files[i][0] == filename)
                return files[i][1];
        }
        return [];
    }
    // returns success
    FileLoad() {
        let startup = (this.StartupPRG != null);
        let addr = this.FileAddr;
        let success = true;
        let err = 0;
        let filename = this.StartupPRG;
        let stream = this.OpenRead(filename);
        if (stream.length == 0) {
            err = 4; // FILE NOT FOUND
            success = false;
            this.FileAddr = addr;
            return [success, err];
        }
        let lo = stream.splice(0, 1)[0];
        let hi = stream.splice(0, 1)[0];
        if (startup) {
            if (lo == 1)
                this.FileSec = 0;
            else
                this.FileSec = 1;
        }
        if (this.FileSec == 1) // use address in file? yes-use, no-ignore
            addr = lo | (hi << 8); // use address specified in file
        let i;
        while (success) {
            if (stream.length > 0) {
                i = stream.splice(0, 1)[0];
                if (this.FileVerify) {
                    if (this.memory.get(addr) != i) {
                        err = 28; // VERIFY
                        success = false;
                    }
                }
                else
                    this.memory.set(addr, i);
                addr = this.cpu.IncWord(addr);
            }
            else
                break; // end of file
        }
        this.FileAddr = addr;
        return [success, err];
    }
    FileSave(filename, addr1, addr2) {
        if (filename.length == 0)
            filename = "FILENAME";
        if (!filename.toUpperCase().endsWith(".PRG"))
            filename += ".PRG";
        var stream = [];
        stream.push(this.cpu.LO(addr1));
        stream.push(this.cpu.HI(addr1));
        var addr;
        for (addr = addr1; addr <= addr2; ++addr)
            stream.push(this.memory.get(addr));
        this.memory.getWorker().postMessage(["save", filename, stream]);
        return true;
    }
}
// walk6502.ts - Class Walk6502
// disassembly of all reachable executable code including branches, jump, calls
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
class Walk6502 {
    constructor() {
        this.seen = [];
    }
    Reset() {
        this.seen = [];
    }
    Walk(cpu, addr) {
        let conditional;
        let bytes;
        let addr2;
        let branches = [];
        while (true) {
            if (this.seen.indexOf(addr) >= 0) {
                while (true) {
                    if (branches.length == 0)
                        return; // done with walk
                    else {
                        addr = branches.splice(0, 1)[0]; // walk a saved address
                        if (this.seen.indexOf(addr) < 0)
                            break;
                    }
                }
            }
            let line;
            let dis;
            [dis, conditional, bytes, addr2, line] = cpu.Disassemble_Long(addr);
            console.log(line);
            if (dis != "???")
                this.seen.push(addr);
            switch (dis) {
                case "BRK":
                case "RTI":
                case "RTS":
                case "???":
                    if (branches.length == 0)
                        return; // done with walk
                    else {
                        addr = branches.splice(0, 1)[0]; // walk a saved address
                        break;
                    }
                default:
                    if (!conditional && addr2 != 0) {
                        if (dis.indexOf("JSR") == 0) {
                            this.Walk(cpu, addr2); // walk call recursively, then continue next address
                            addr += bytes;
                        }
                        else
                            addr = addr2;
                    }
                    else {
                        addr += bytes;
                        if (conditional && this.seen.indexOf(addr2) < 0 && branches.indexOf(addr2) < 0)
                            branches.push(addr2); // save branch address for later
                    }
                    break;
            }
        }
    }
}
class CharPlotter {
    constructor(worker) {
        this.worker = worker;
    }
    draw(c, mixedcase, x, y, fg, bg) {
        let j = (c + (mixedcase ? 256 : 0)) * 8;
        let chardata = [
            char_rom[j],
            char_rom[j + 1],
            char_rom[j + 2],
            char_rom[j + 3],
            char_rom[j + 4],
            char_rom[j + 5],
            char_rom[j + 6],
            char_rom[j + 7]
        ];
        this.worker.postMessage(["char", chardata, x, y, fg, bg]);
    }
    border(color) {
        this.worker.postMessage(["border", color]);
    }
    getWorker() {
        return this.worker;
    }
}
function worker_function() {
    const worker = self;
    let c64 = new EmuC64(64 * 1024, new CharPlotter(worker));
    //c64.Walk([]);
    c64.ResetRun();
    console.log("done");
}
onmessage = function (e) {
    //console.log("worker received: " + e.data)
    if (typeof e.data == "object") {
        if (typeof e.data.keys == "string") {
            //console.log("rcvd keys: " + e.data.keys);
            scancodes_queue.push(e.data.keys);
        }
        else if (e.data.basic && e.data.kernal && e.data.char) {
            basic_rom = e.data.basic;
            kernal_rom = e.data.kernal;
            char_rom = e.data.char;
        }
        else if (e.data.redraw == true) {
            redraw_screen = true;
        }
        else if (e.data.autoexec) {
            autoexec = e.data.autoexec;
        }
    }
    //postMessage(["ack"], "onmessage");
};
worker_function();
//# sourceMappingURL=c64-6502.js.map