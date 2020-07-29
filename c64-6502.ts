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

let scancodes_queue : string[] = []; // queue of string, each is comma separated list of scan codes
let scancodes_irq : string[] = []; // array of scan codes, used for full IRQ cycle
let basic_rom: number[] = [];
let char_rom: number[] = [];
let kernal_rom: number[] = [];
let redraw_screen: boolean = true;
let attach: Uint8Array = new Uint8Array(0);
let autoexec: boolean = false;
let timerA_enabled: boolean = false;
let timerA_triggered: boolean = false;

interface Memory {
    get(i: number): number;
    set(i: number, value: number): void;
}

class Emu6502 {
    protected memory: Memory;
    public breakpoints: number[];

    public A: number = 0;
    public X: number = 0;
    public Y: number = 0;
    protected S: number = 0xFF;
    protected N: boolean = false;
    protected V: boolean = false;
    protected B: boolean = false;
    protected D: boolean = false;
    protected I: boolean = false;
    protected Z: boolean = false;
    public C: boolean = false;
    public PC: number = 0;

    protected trace_count: number = 0;
    protected trace: boolean = false;
    protected step: boolean = false;
    protected exit: boolean = false;
    protected yield: boolean = false;

    protected execute: (context: any) => boolean;
    protected context: any;

    private roms_loaded : boolean = false;

    public constructor(memory: Memory, execute: (context: any) => boolean, context: any) {
        this.memory = memory;
        this.execute = execute;
        this.context = context;
        this.breakpoints = [];
    }

    public async ResetRun() {
        // wait for ROMs
        while (!this.roms_loaded)
        {
            let missing_roms : boolean = false;
            if (kernal_rom.length != 8192)
                missing_roms = true;
            if (basic_rom.length != 8192)
                missing_roms = true;
            if (char_rom.length != 4096)
                missing_roms = true;
            if (missing_roms)
            {
                console.log("waiting a second for Commodore ROMs...");
                await new Promise(r => setTimeout(r, 1000));
            }
            else
                this.roms_loaded = true;
        }

        let addr: number = (this.memory.get(0xFFFC) | (this.memory.get(0xFFFD) << 8)); // JMP(RESET)
        this.Execute(addr);
    }

    Walk(addrs: number[]) {
        var walker = new Walk6502();
        if (addrs.length == 0)
            walker.Walk(this, this.memory.get(0xFFFC) | (this.memory.get(0xFFFD) << 8));
        else {
            let i: number;
            for (i = 0; i < addrs.length; ++i)
                walker.Walk(this, addrs[i]);
        }
    }

    public static toHex(value: number, digits: number): string {
        let s: string = value.toString(16).toUpperCase();
        while (s.length < digits)
            s = "0" + s;
        return s;
    }

    public static toHex8(value: number): string {
        return Emu6502.toHex(value, 2);
    }

    public static toHex16(value: number): string {
        return Emu6502.toHex(value, 4);
    }

    getNextScanCodes()
    {
        if (scancodes_queue.length > 0) {
            let s = scancodes_queue.shift();
            if (s==null || s.length == 0)
                scancodes_irq = [];
            else
                scancodes_irq = s.split(',');
        }
        // else keep same ones going, either still pressed or not pressed
    }

    isTimerAStarted(): boolean {
        let bank = this.memory.get(1);
        let reset_bank = false;
        let result = true;
        if ((bank & 3) == 0 || (bank & 4) == 0) { // check if IO is banked out
            reset_bank = true; // remember to restore
            this.memory.set(1, 7); // necessary to switch bank to IO
        }
        result = (this.memory.get(0xDC0E) & 1) == 1; // Control Register A, Timer Started
        if (reset_bank)
            this.memory.set(1, bank); // need to restore banking state
        return result;
    }

    async Execute(addr: number) {
        let conditional: boolean;
        let bytes: number;
        let interrupt_time = (1 / 60) * 1000; // 60 times per second, converted to milliseconds
        let timer_then = Date.now();
        let timer2 = timer_then;

        this.PC = addr;

        while (true) {

            while (true) {
                let timer_read = Date.now();
                let irq = false;
                if ((timer_read - timer_then) >= interrupt_time) // 1/60th of a second
                {
                    if (!this.I) { // if IRQ not disabled
                        timer_then = timer_read;
                        this.getNextScanCodes(); // each IRQ gets new buffered scan codes to help guarantee keystrokes get through
                        if (timerA_enabled && this.isTimerAStarted()) { // timer hardware enabled?
                            this.Push(this.HI(this.PC));          
                            this.Push(this.LO(this.PC));          
                            this.PHP();
                            this.I = true;
                            this.PC = this.memory.get(0xFFFE) | (this.memory.get(0xFFFF) << 8);
                            irq = true;
                            timer2 = timer_read;
                            timerA_triggered = true;
                        }
                    }

                    // if (!irq && ((timer_read - timer2))) // yield every 1/60th of a second even if irq didn't happen
                    // {
                    //     await new Promise(r => setTimeout(r, 0));
                    //     timer2 = timer_read;
                    // }
                }
                if (this.exit)
                    return;
                bytes = 1;
                let breakpoint: boolean = false;
                if (this.breakpoints.indexOf(this.PC) >= 0)
                     breakpoint = true;

                if (this.trace || breakpoint || this.step) {
                    let addr2: number;
                    let line: string;
                    let dis: string;
                    [dis, conditional, bytes, addr2, line] = this.Disassemble_Long(this.PC);
                    while (line.length < 30)
                        line += ' ';
                    let state: string = this.GetDisplayState();
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
                case 0x00: this.BRK(); bytes = 0; break;
                case 0x01: this.ORA(this.GetIndX()); bytes = 2; break;
                case 0x05: this.ORA(this.GetZP()); bytes = 2; break;
                case 0x06: this.SetZP(this.ASL(this.GetZP())); bytes = 2; break;
                case 0x08: this.PHP(); break;
                case 0x09: this.ORA(this.GetIM()); bytes = 2; break;
                case 0x0A: this.SetA(this.ASL(this.A)); break;
                case 0x0D: this.ORA(this.GetABS()); bytes = 3; break;
                case 0x0E: this.SetABS(this.ASL(this.GetABS())); bytes = 3; break;

                case 0x10: this.BPL(); conditional = true; bytes = 0; break;
                case 0x11: this.ORA(this.GetIndY()); bytes = 2; break;
                case 0x15: this.ORA(this.GetZPX()); bytes = 2; break;
                case 0x16: this.SetZPX(this.ASL(this.GetZPX())); bytes = 2; break;
                case 0x18: this.CLC(); break;
                case 0x19: this.ORA(this.GetABSY()); bytes = 3; break;
                case 0x1D: this.ORA(this.GetABSX()); bytes = 3; break;
                case 0x1E: this.SetABSX(this.ASL(this.GetABSX())); bytes = 3; break;

                case 0x20: this.JSR(); bytes = 0; break;
                case 0x21: this.AND(this.GetIndX()); bytes = 2; break;
                case 0x24: this.BIT(this.GetZP()); bytes = 2; break;
                case 0x25: this.AND(this.GetZP()); bytes = 2; break;
                case 0x26: this.SetZP(this.ROL(this.GetZP())); bytes = 2; break;
                case 0x28: this.PLP(); break;
                case 0x29: this.AND(this.GetIM()); bytes = 2; break;
                case 0x2A: this.SetA(this.ROL(this.A)); break;
                case 0x2C: this.BIT(this.GetABS()); bytes = 3; break;
                case 0x2D: this.AND(this.GetABS()); bytes = 3; break;
                case 0x2E: this.ROL(this.GetABS()); bytes = 3; break;

                case 0x30: this.BMI(); conditional = true; bytes = 0; break;
                case 0x31: this.AND(this.GetIndY()); bytes = 2; break;
                case 0x35: this.AND(this.GetZPX()); bytes = 2; break;
                case 0x36: this.SetZPX(this.ROL(this.GetZPX())); bytes = 2; break;
                case 0x38: this.SEC(); break;
                case 0x39: this.AND(this.GetABSY()); bytes = 3; break;
                case 0x3D: this.AND(this.GetABSX()); bytes = 3; break;
                case 0x3E: this.SetABSX(this.ROL(this.GetABSX())); bytes = 3; break;

                case 0x40: this.RTI(); bytes = 0; break;
                case 0x41: this.EOR(this.GetIndX()); bytes = 2; break;
                case 0x45: this.EOR(this.GetZP()); bytes = 2; break;
                case 0x46: this.SetZP(this.LSR(this.GetZP())); bytes = 2; break;
                case 0x48: this.PHA(); break;
                case 0x49: this.EOR(this.GetIM()); bytes = 2; break;
                case 0x4A: this.SetA(this.LSR(this.A)); break;
                case 0x4C: this.JMP(); bytes = 0; break;
                case 0x4D: this.EOR(this.GetABS()); bytes = 3; break;
                case 0x4E: this.LSR(this.GetABS()); bytes = 3; break;

                case 0x50: this.BVC(); conditional = true; bytes = 0; break;
                case 0x51: this.EOR(this.GetIndY()); bytes = 2; break;
                case 0x55: this.EOR(this.GetZPX()); bytes = 2; break;
                case 0x56: this.SetZPX(this.LSR(this.GetZPX())); bytes = 2; break;
                case 0x58: this.CLI(); break;
                case 0x59: this.EOR(this.GetABSY()); bytes = 3; break;
                case 0x5D: this.EOR(this.GetABSX()); bytes = 3; break;
                case 0x5E: this.SetABSX(this.LSR(this.GetABSX())); bytes = 3; break;

                case 0x60: this.RTS(); bytes = 0; break;
                case 0x61: this.ADC(this.GetIndX()); bytes = 2; break;
                case 0x65: this.ADC(this.GetZP()); bytes = 2; break;
                case 0x66: this.SetZP(this.ROR(this.GetZP())); bytes = 2; break;
                case 0x68: this.PLA(); break;
                case 0x69: this.ADC(this.GetIM()); bytes = 2; break;
                case 0x6A: this.SetA(this.ROR(this.A)); break;
                case 0x6C: this.JMPIND(); bytes = 0; break;
                case 0x6D: this.ADC(this.GetABS()); bytes = 3; break;
                case 0x6E: this.SetABS(this.ROR(this.GetABS())); bytes = 3; break;

                case 0x70: this.BVS(); conditional = true; bytes = 0; break;
                case 0x71: this.ADC(this.GetIndY()); bytes = 2; break;
                case 0x75: this.ADC(this.GetZPX()); bytes = 2; break;
                case 0x76: this.SetZPX(this.ROR(this.GetZPX())); bytes = 2; break;
                case 0x78: this.SEI(); break;
                case 0x79: this.ADC(this.GetABSY()); bytes = 3; break;
                case 0x7D: this.ADC(this.GetABSX()); bytes = 3; break;
                case 0x7E: this.SetABSX(this.ROR(this.GetABSX())); bytes = 3; break;

                case 0x81: this.SetIndX(this.A); bytes = 2; break;
                case 0x84: this.SetZP(this.Y); bytes = 2; break;
                case 0x85: this.SetZP(this.A); bytes = 2; break;
                case 0x86: this.SetZP(this.X); bytes = 2; break;
                case 0x88: this.DEY(); break;
                case 0x8A: this.TXA(); break;
                case 0x8C: this.SetABS(this.Y); bytes = 3; break;
                case 0x8D: this.SetABS(this.A); bytes = 3; break;
                case 0x8E: this.SetABS(this.X); bytes = 3; break;

                case 0x90: this.BCC(); conditional = true; bytes = 0; break;
                case 0x91: this.SetIndY(this.A); bytes = 2; break;
                case 0x94: this.SetZPX(this.Y); bytes = 2; break;
                case 0x95: this.SetZPX(this.A); bytes = 2; break;
                case 0x96: this.SetZPY(this.X); bytes = 2; break;
                case 0x98: this.TYA(); break;
                case 0x99: this.SetABSY(this.A); bytes = 3; break;
                case 0x9A: this.TXS(); break;
                case 0x9D: this.SetABSX(this.A); bytes = 3; break;

                case 0xA0: this.SetY(this.GetIM()); bytes = 2; break;
                case 0xA1: this.SetA(this.GetIndX()); bytes = 2; break;
                case 0xA2: this.SetX(this.GetIM()); bytes = 2; break;
                case 0xA4: this.SetY(this.GetZP()); bytes = 2; break;
                case 0xA5: this.SetA(this.GetZP()); bytes = 2; break;
                case 0xA6: this.SetX(this.GetZP()); bytes = 2; break;
                case 0xA8: this.TAY(); break;
                case 0xA9: this.SetA(this.GetIM()); bytes = 2; break;
                case 0xAA: this.TAX(); break;
                case 0xAC: this.SetY(this.GetABS()); bytes = 3; break;
                case 0xAD: this.SetA(this.GetABS()); bytes = 3; break;
                case 0xAE: this.SetX(this.GetABS()); bytes = 3; break;

                case 0xB0: this.BCS(); conditional = true; bytes = 0; break;
                case 0xB1: this.SetA(this.GetIndY()); bytes = 2; break;
                case 0xB4: this.SetY(this.GetZPX()); bytes = 2; break;
                case 0xB5: this.SetA(this.GetZPX()); bytes = 2; break;
                case 0xB6: this.SetX(this.GetZPY()); bytes = 2; break;
                case 0xB8: this.CLV(); break;
                case 0xB9: this.SetA(this.GetABSY()); bytes = 3; break;
                case 0xBA: this.TSX(); break;
                case 0xBC: this.SetY(this.GetABSX()); bytes = 3; break;
                case 0xBD: this.SetA(this.GetABSX()); bytes = 3; break;
                case 0xBE: this.SetX(this.GetABSY()); bytes = 3; break;

                case 0xC0: this.CPY(this.GetIM()); bytes = 2; break;
                case 0xC1: this.CMP(this.GetIndX()); bytes = 2; break;
                case 0xC4: this.CPY(this.GetZP()); bytes = 2; break;
                case 0xC5: this.CMP(this.GetZP()); bytes = 2; break;
                case 0xC6: this.SetZP(this.DEC(this.GetZP())); bytes = 2; break;
                case 0xC8: this.INY(); break;
                case 0xC9: this.CMP(this.GetIM()); bytes = 2; break;
                case 0xCA: this.DEX(); break;
                case 0xCC: this.CPY(this.GetABS()); bytes = 3; break;
                case 0xCD: this.CMP(this.GetABS()); bytes = 3; break;
                case 0xCE: this.SetABS(this.DEC(this.GetABS())); bytes = 3; break;

                case 0xD0: this.BNE(); conditional = true; bytes = 0; break;
                case 0xD1: this.CMP(this.GetIndY()); bytes = 2; break;
                case 0xD5: this.CMP(this.GetZPX()); bytes = 2; break;
                case 0xD6: this.SetZPX(this.DEC(this.GetZPX())); bytes = 2; break;
                case 0xD8: this.CLD(); break;
                case 0xD9: this.CMP(this.GetABSY()); bytes = 3; break;
                case 0xDD: this.CMP(this.GetABSX()); bytes = 3; break;
                case 0xDE: this.SetABSX(this.DEC(this.GetABSX())); bytes = 3; break;

                case 0xE0: this.CPX(this.GetIM()); bytes = 2; break;
                case 0xE1: this.SBC(this.GetIndX()); bytes = 2; break;
                case 0xE4: this.CPX(this.GetZP()); bytes = 2; break;
                case 0xE5: this.SBC(this.GetZP()); bytes = 2; break;
                case 0xE6: this.SetZP(this.INC(this.GetZP())); bytes = 2; break;
                case 0xE8: this.INX(); break;
                case 0xE9: this.SBC(this.GetIM()); bytes = 2; break;
                case 0xEA: this.NOP(); break;
                case 0xEC: this.CPX(this.GetABS()); bytes = 3; break;
                case 0xED: this.SBC(this.GetABS()); bytes = 3; break;
                case 0xEE: this.SetABS(this.INC(this.GetABS())); bytes = 3; break;

                case 0xF0: this.BEQ(); conditional = true; bytes = 0; break;
                case 0xF1: this.SBC(this.GetIndY()); bytes = 2; break;
                case 0xF5: this.SBC(this.GetZPX()); bytes = 2; break;
                case 0xF6: this.SetZPX(this.INC(this.GetZPX())); bytes = 2; break;
                case 0xF8: this.SED(); break;
                case 0xF9: this.SBC(this.GetABSY()); bytes = 3; break;
                case 0xFD: this.SBC(this.GetABSX()); bytes = 3; break;
                case 0xFE: this.SetABSX(this.INC(this.GetABSX())); bytes = 3; break;

                default:
                    throw new Error("Invalid opcode " + this.memory.get(this.PC) + " at " + this.PC);
            }

            this.PC = (this.PC + bytes) & 0xFFFF;

            if (this.yield)
                await new Promise(r => setTimeout(r, 0));
        }
    }

    // https://javascript.info/task/delay-promise
    // async delay(ms : number) {
    //     return new Promise(resolve => setTimeout(resolve, ms));
    // }

    CMP(value: number) {
        this.Subtract(this.A, value);
    }

    CPX(value: number) {
        this.Subtract(this.X, value);
    }

    CPY(value: number) {
        this.Subtract(this.Y, value);
    }

    SBC(value: number) {
        if (this.D) {
            let A_dec: number = (this.A & 0xF) + ((this.A >> 4) * 10);
            let value_dec: number = (value & 0xF) + ((value >> 4) * 10);
            let result_dec: number = A_dec - value_dec - (this.C ? 0 : 1);
            this.C = (result_dec >= 0);
            if (!this.C)
                result_dec = -result_dec; // absolute value
            let result: number = (result_dec % 10) | (((result_dec / 10) % 10) << 4);
            this.SetA(result);
            this.N = false; // undefined?
            this.V = false; // undefined?
        }
        else {
            let overflow: [boolean] = [this.V];
            let result: number = this.Subtract(this.A, value, overflow);
            this.V = overflow[0];
            this.SetA(result);
        }
    }

    Subtract(reg: number, value: number, overflow?: [boolean]) {
        if (overflow == null)
            this.C = true; // init for CMP, etc.
        let old_reg_neg: boolean = (reg & 0x80) != 0;
        let value_neg: boolean = (value & 0x80) != 0;
        let result: number = reg - value - (this.C ? 0 : 1);
        this.N = (result & 0x80) != 0;
        this.C = (result >= 0);
        this.Z = (result == 0);
        let result_neg: boolean = (result & 0x80) != 0;
        if (overflow != null)
            overflow[0] = (old_reg_neg && !value_neg && !result_neg) // neg - pos = pos
                || (!old_reg_neg && value_neg && result_neg); // pos - neg = neg
        return result;
    }

    ADC(value: number) {
        let result: number;
        if (this.D) {
            let A_dec: number = (this.A & 0xF) + ((this.A >> 4) * 10);
            let value_dec: number = (value & 0xF) + ((value >> 4) * 10);
            let result_dec: number = A_dec + value_dec + (this.C ? 1 : 0);
            this.C = (result_dec > 99);
            result = (result_dec % 10) | (((result_dec / 10) % 10) << 4);
            this.SetA(result);
            this.Z = (result_dec == 0); // BCD quirk -- 100 doesn't set Z
            this.V = false;
        }
        else {
            let A_old_neg: boolean = (this.A & 0x80) != 0;
            let value_neg: boolean = (value & 0x80) != 0;
            let result: number = this.A + value + (this.C ? 1 : 0);
            this.C = (result & 0x100) != 0;
            this.SetA(result);
            let result_neg: boolean = (result & 0x80) != 0;
            this.V = (!A_old_neg && !value_neg && result_neg) // pos + pos = neg: overflow
                || (A_old_neg && value_neg && !result_neg); // neg + neg = pos: overflow
        }
    }

    ORA(value: number) {
        this.SetA(this.A | value);
    }

    EOR(value: number) {
        this.SetA(this.A ^ value);
    }

    AND(value: number) {
        this.SetA(this.A & value);
    }

    BIT(value: number) {
        this.Z = (this.A & value) == 0;
        this.N = (value & 0x80) != 0;
        this.V = (value & 0x40) != 0;
    }

    ASL(value: number) {
        this.C = (value & 0x80) != 0;
        value = (value << 1) & 0xFF;
        this.Z = (value == 0);
        this.N = (value & 0x80) != 0;
        return value;
    }

    LSR(value: number) {
        this.C = (value & 0x01) != 0;
        value = (value >> 1);
        this.Z = (value == 0);
        this.N = false;
        return value;
    }

    ROL(value: number) {
        let newC: boolean = (value & 0x80) != 0;
        value = ((value << 1) & 0xFF) | (this.C ? 1 : 0);
        this.C = newC;
        this.Z = (value == 0);
        this.N = (value & 0x80) != 0;
        return value;
    }

    ROR(value: number) {
        let newC: boolean = (value & 0x01) != 0;
        this.N = this.C;
        value = ((value >> 1) | (this.C ? 0x80 : 0));
        this.C = newC;
        this.Z = (value == 0);
        return value;
    }

    Push(value: number) {
        this.memory.set(0x100 | this.S, value);        
        this.S = (this.S - 1) & 0xFF;
    }

    Pop() {
        this.S = (this.S + 1) & 0xFF;
        return this.memory.get(0x100 | this.S);
    }

    PHP() {
        let flags: number = 
            (this.N ? 0x80 : 0)
            | (this.V ? 0x40 : 0)
            | (this.B ? 0x10 : 0)
            | (this.D ? 0x08 : 0)
            | (this.I ? 0x04 : 0)
            | (this.Z ? 0x02 : 0)
            | (this.C ? 0x01 : 0);
        this.Push(flags);
    }

    PLP() {
        let flags: number = this.Pop();
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

    DEC(value: number) {
        value = (value - 1) & 0xFF;
        this.Z = (value == 0);
        this.N = (value & 0x80) != 0;
        return value;
    }

    INC(value: number) {
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

    BR(branch: boolean) {
        let addr2: number = this.GetBR();
        if (branch)
            this.PC = addr2;
        else
            this.PC = this.IncWord(this.PC+1); // safer +2
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
        let addr2: number = this.IncWord(this.PC+1); // safer than +2
        this.Push(this.HI(addr2));
        this.Push(this.LO(addr2));
        this.PC = this.GetNextWord(this.PC);
    }

    public RTS() {
        let lo: number = this.Pop();
        let hi: number = this.Pop();
        this.PC = this.IncWord((hi << 8) | lo);
    }

    RTI() {
        this.PLP();
        let lo: number = this.Pop();
        let hi: number = this.Pop();
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
        let addr2: number = this.GetNextWord(this.PC);
        if ((addr2 & 0xFF) == 0xFF) // JMP($XXFF) won't go over page boundary
            this.PC = (this.memory.get(addr2) | (this.memory.get(addr2 - 0xFF) << 8)); // 6502 "bug" - will use XXFF and XX00 as source of address
        else
            this.PC = this.memory.get(addr2) | (this.memory.get(addr2+1) << 8); // note: IncWord not necessary 'cause already checked for overflow
    }

    public SetA(value: number) {
        this.A = this.SetReg(value);
    }

    public SetX(value: number) {
        this.X = this.SetReg(value);
    }

    public SetY(value: number) {
        this.Y = this.SetReg(value);
    }

    SetReg(value: number) {
        value = value & 0xFF; // truncate to byte
        this.Z = (value == 0);
        this.N = ((value & 0x80) != 0);
        return value;
    }

    GetIndX() {
        let addr2: number = (this.memory.get(this.IncWord(this.PC)) + this.X) & 0xFF; // compute ZP address using offset
        let addr3: number = this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8); // stay in ZP
        return this.memory.get(addr3);
    }

    SetIndX(value: number) {
        let addr2: number = (this.memory.get(this.IncWord(this.PC)) + this.X) & 0xFF; // compute ZP address using offset
        let addr3: number = this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8); // stay in ZP
        this.memory.set(addr3, value);
    }

    GetIndY() {
        let addr2: number = this.memory.get(this.IncWord(this.PC)); // get ZP address
        let addr3: number = (this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8)) + this.Y; // keep source in ZP, add offset
        return this.memory.get(addr3);
    }

    SetIndY(value: number) {
        let addr2: number = this.memory.get(this.IncWord(this.PC)); // get ZP address
        let addr3: number = (this.memory.get(addr2) | (this.memory.get((addr2 + 1) & 0xFF) << 8)) + this.Y; // keep source in ZP, add offset
        this.memory.set(addr3, value);
    }

    GetZP() {
        let addr2: number = this.memory.get(this.IncWord(this.PC));
        return this.memory.get(addr2);
    }

    SetZP(value: number) {
        let addr2: number = this.memory.get(this.IncWord(this.PC));
        this.memory.set(addr2, value);
    }

    GetZPX() {
        let addr2: number = this.memory.get(this.IncWord(this.PC));
        return this.memory.get((addr2 + this.X) & 0xFF);
    }

    SetZPX(value: number) {
        let addr2: number = this.memory.get(this.IncWord(this.PC));
        this.memory.set((addr2 + this.X) & 0xFF, value);
    }

    GetZPY() {
        let addr2: number = this.memory.get(this.IncWord(this.PC));
        return this.memory.get((addr2 + this.Y) & 0xFF);
    }

    SetZPY(value: number) {
        let addr2: number = this.memory.get(this.IncWord(this.PC));
        this.memory.set((addr2 + this.Y) & 0xFF, value);
    }

    GetABS() {
        let addr2: number = this.GetNextWord(this.PC);
        let value = this.memory.get(addr2);
        if (addr2 == 0xDC01) // keyboard scan read
            this.yield = true;
        return value;
    }

    SetABS(value: number) {
        let addr2: number = this.GetNextWord(this.PC);
        this.memory.set(addr2, value);
    }

    GetABSX() {
        let addr2: number = (this.GetNextWord(this.PC) + this.X) & 0xFFFF;
        return this.memory.get(addr2);
    }

    SetABSX(value: number) {
        let addr2: number = (this.GetNextWord(this.PC) + this.X) & 0xFFFF;
        this.memory.set(addr2, value);
    }

    GetABSY() {
        let addr2: number = (this.GetNextWord(this.PC) + this.Y) & 0xFFFF;
        return this.memory.get(addr2);
    }

    SetABSY(value: number) {
        let addr2: number = (this.GetNextWord(this.PC) + this.Y) & 0xFFFF;
        this.memory.set(addr2, value);
    }

    GetIM() {
        return this.memory.get(this.IncWord(this.PC));
    }

    GetBR() {
        let offset: number = this.sbyte(this.memory.get(this.IncWord(this.PC)));
        return (this.PC + 2 + offset) & 0xFFFF;
    }

    public sbyte(value: number) {
        value &= 0xFF; // force to byte
        if (value & 0x80)
            return - ((value ^ 0xFF) + 1); // signed byte is negative -128..-1
        else
            return value; // signed byte is non-negative 0..127
    }

    IncWord(value: number) {
        return (value + 1) & 0xFFFF;
    }

    protected GetNextWord(addr: number) {
        let addr1: number = this.IncWord(addr);
        let addr2: number = this.IncWord(addr1);
        return (this.memory.get(addr1) | (this.memory.get(addr2) << 8));
    }

    public LO(value: number) {
        return value & 0xFF; // low byte
    }

    public HI(value: number) {
        return (value >> 8) & 0xFF; // high byte
    }

    GetDisplayState(): string {
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

    public Disassemble_Long(addr: number): [string, boolean, number, number, string] {
        let dis: string;
        let conditional: boolean;
        let bytes: number;
        let addr2: number;
        let line: string;
        [dis, conditional, bytes, addr2] = this.Disassemble_Short(addr);
        let s: string = "";
        s += Emu6502.toHex16(addr) + " ";
        let i: number;
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

    Disassemble_Short(addr: number): [string, boolean, number, number] {
        let conditional: boolean = false;
        let bytes: number = 1;
        let addr2: number = 0;
        let dis: string;

        switch (this.memory.get(addr)) {
            case 0x00: dis = "BRK"; break;
            case 0x01: [dis, bytes] = this.DisIndX("ORA", addr); break;
            case 0x05: [dis, bytes] = this.DisZP("ORA", addr); break;
            case 0x06: [dis, bytes] = this.DisZP("ASL", addr); break;
            case 0x08: dis = "PHP"; break;
            case 0x09: [dis, bytes] = this.DisIM("ORA", addr); break;
            case 0x0A: dis = "ASL A"; break;
            case 0x0D: [dis, bytes] = this.DisABS("ORA", addr); break;
            case 0x0E: [dis, bytes] = this.DisABS("ASL", addr); break;

            case 0x10: [dis, conditional, addr2, bytes] = this.DisBR("BPL", addr); break;
            case 0x11: [dis, bytes] = this.DisIndY("ORA", addr); break;
            case 0x15: [dis, bytes] = this.DisZPX("ORA", addr); break;
            case 0x16: [dis, bytes] = this.DisZPX("ASL", addr); break;
            case 0x18: dis = "CLC"; break;
            case 0x19: [dis, bytes] = this.DisABSY("ORA", addr); break;
            case 0x1D: [dis, bytes] = this.DisABSX("ORA", addr); break;
            case 0x1E: [dis, bytes] = this.DisABSX("ASL", addr); break;

            case 0x20: [dis, addr2, bytes] = this.DisABSAddr("JSR", addr); break;
            case 0x21: [dis, bytes] = this.DisIndX("AND", addr); break;
            case 0x24: [dis, bytes] = this.DisZP("BIT", addr); break;
            case 0x25: [dis, bytes] = this.DisZP("AND", addr); break;
            case 0x26: [dis, bytes] = this.DisZP("ROL", addr); break;
            case 0x28: dis = "PLP"; break;
            case 0x29: [dis, bytes] = this.DisIM("AND", addr); break;
            case 0x2A: dis = "ROL A"; break;
            case 0x2C: [dis, bytes] = this.DisABS("BIT", addr); break;
            case 0x2D: [dis, bytes] = this.DisABS("AND", addr); break;
            case 0x2E: [dis, bytes] = this.DisABS("ROL", addr); break;

            case 0x30: [dis, conditional, addr2, bytes] = this.DisBR("BMI", addr); break;
            case 0x31: [dis, bytes] = this.DisIndY("AND", addr); break;
            case 0x35: [dis, bytes] = this.DisZPX("AND", addr); break;
            case 0x36: [dis, bytes] = this.DisZPX("ROL", addr); break;
            case 0x38: dis = "SEC"; break;
            case 0x39: [dis, bytes] = this.DisABSY("AND", addr); break;
            case 0x3D: [dis, bytes] = this.DisABSX("AND", addr); break;
            case 0x3E: [dis, bytes] = this.DisABSX("ROL", addr); break;

            case 0x40: dis = "RTI"; break;
            case 0x41: [dis, bytes] = this.DisIndX("EOR", addr); break;
            case 0x45: [dis, bytes] = this.DisZP("EOR", addr); break;
            case 0x46: [dis, bytes] = this.DisZP("LSR", addr); break;
            case 0x48: dis = "PHA"; break;
            case 0x49: [dis, bytes] = this.DisIM("EOR", addr); break;
            case 0x4A: dis = "LSR A"; break;
            case 0x4C: [dis, addr2, bytes] = this.DisABSAddr("JMP", addr); break;
            case 0x4D: [dis, bytes] = this.DisABS("EOR", addr); break;
            case 0x4E: [dis, bytes] = this.DisABS("LSR", addr); break;

            case 0x50: [dis, conditional, addr2, bytes] = this.DisBR("BVC", addr); break;
            case 0x51: [dis, bytes] = this.DisIndY("EOR", addr); break;
            case 0x55: [dis, bytes] = this.DisZPX("EOR", addr); break;
            case 0x56: [dis, bytes] = this.DisZPX("LSR", addr); break;
            case 0x58: dis = "CLI"; break;
            case 0x59: [dis, bytes] = this.DisABSY("EOR", addr); break;
            case 0x5D: [dis, bytes] = this.DisABSX("EOR", addr); break;
            case 0x5E: [dis, bytes] = this.DisABSX("LSR", addr); break;

            case 0x60: dis = "RTS"; break;
            case 0x61: [dis, bytes] = this.DisIndX("ADC", addr); break;
            case 0x65: [dis, bytes] = this.DisZP("ADC", addr); break;
            case 0x66: [dis, bytes] = this.DisZP("ROR", addr); break;
            case 0x68: dis = "PLA"; break;
            case 0x69: [dis, bytes] = this.DisIM("ADC", addr); break;
            case 0x6A: dis = "ROR A"; break;
            case 0x6C: [dis, addr2, bytes] = this.DisInd("JMP", addr); break;
            case 0x6D: [dis, bytes] = this.DisABS("ADC", addr); break;
            case 0x6E: [dis, bytes] = this.DisABS("ROR", addr); break;

            case 0x70: [dis, conditional, addr2, bytes] = this.DisBR("BVS", addr); break;
            case 0x71: [dis, bytes] = this.DisIndY("ADC", addr); break;
            case 0x75: [dis, bytes] = this.DisZPX("ADC", addr); break;
            case 0x76: [dis, bytes] = this.DisZPX("ROR", addr); break;
            case 0x78: dis = "SEI"; break;
            case 0x79: [dis, bytes] = this.DisABSY("ADC", addr); break;
            case 0x7D: [dis, bytes] = this.DisABSX("ADC", addr); break;
            case 0x7E: [dis, bytes] = this.DisABSX("ROR", addr); break;

            case 0x81: [dis, bytes] = this.DisIndX("STA", addr); break;
            case 0x84: [dis, bytes] = this.DisZP("STY", addr); break;
            case 0x85: [dis, bytes] = this.DisZP("STA", addr); break;
            case 0x86: [dis, bytes] = this.DisZP("STX", addr); break;
            case 0x88: dis = "DEY"; break;
            case 0x8A: dis = "TXA"; break;
            case 0x8C: [dis, bytes] = this.DisABS("STY", addr); break;
            case 0x8D: [dis, bytes] = this.DisABS("STA", addr); break;
            case 0x8E: [dis, bytes] = this.DisABS("STX", addr); break;

            case 0x90: [dis, conditional, addr2, bytes] = this.DisBR("BCC", addr); break;
            case 0x91: [dis, bytes] = this.DisIndY("STA", addr); break;
            case 0x94: [dis, bytes] = this.DisZPX("STY", addr); break;
            case 0x95: [dis, bytes] = this.DisZPX("STA", addr); break;
            case 0x96: [dis, bytes] = this.DisZPY("STX", addr); break;
            case 0x98: dis = "TYA"; break;
            case 0x99: [dis, bytes] = this.DisABSY("STA", addr); break;
            case 0x9A: dis = "TXS"; break;
            case 0x9D: [dis, bytes] = this.DisABSX("STA", addr); break;

            case 0xA0: [dis, bytes] = this.DisIM("LDY", addr); break;
            case 0xA1: [dis, bytes] = this.DisIndX("LDA", addr); break;
            case 0xA2: [dis, bytes] = this.DisIM("LDX", addr); break;
            case 0xA4: [dis, bytes] = this.DisZP("LDY", addr); break;
            case 0xA5: [dis, bytes] = this.DisZP("LDA", addr); break;
            case 0xA6: [dis, bytes] = this.DisZP("LDX", addr); break;
            case 0xA8: dis = "TAY"; break;
            case 0xA9: [dis, bytes] = this.DisIM("LDA", addr); break;
            case 0xAA: dis = "TAX"; break;
            case 0xAC: [dis, bytes] = this.DisABS("LDY", addr); break;
            case 0xAD: [dis, bytes] = this.DisABS("LDA", addr); break;
            case 0xAE: [dis, bytes] = this.DisABS("LDX", addr); break;

            case 0xB0: [dis, conditional, addr2, bytes] = this.DisBR("BCS", addr); break;
            case 0xB1: [dis, bytes] = this.DisIndY("LDA", addr); break;
            case 0xB4: [dis, bytes] = this.DisZPX("LDY", addr); break;
            case 0xB5: [dis, bytes] = this.DisZPX("LDA", addr); break;
            case 0xB6: [dis, bytes] = this.DisZPY("LDX", addr); break;
            case 0xB8: dis = "CLV"; break;
            case 0xB9: [dis, bytes] = this.DisABSY("LDA", addr); break;
            case 0xBA: dis = "TSX"; break;
            case 0xBC: [dis, bytes] = this.DisABSX("LDY", addr); break;
            case 0xBD: [dis, bytes] = this.DisABSX("LDA", addr); break;
            case 0xBE: [dis, bytes] = this.DisABSY("LDX", addr); break;

            case 0xC0: [dis, bytes] = this.DisIM("CPY", addr); break;
            case 0xC1: [dis, bytes] = this.DisIndX("CMP", addr); break;
            case 0xC4: [dis, bytes] = this.DisZP("CPY", addr); break;
            case 0xC5: [dis, bytes] = this.DisZP("CMP", addr); break;
            case 0xC6: [dis, bytes] = this.DisZP("DEC", addr); break;
            case 0xC8: dis = "INY"; break;
            case 0xC9: [dis, bytes] = this.DisIM("CMP", addr); break;
            case 0xCA: dis = "DEX"; break;
            case 0xCC: [dis, bytes] = this.DisABS("CPY", addr); break;
            case 0xCD: [dis, bytes] = this.DisABS("CMP", addr); break;
            case 0xCE: [dis, bytes] = this.DisABS("DEC", addr); break;

            case 0xD0: [dis, conditional, addr2, bytes] = this.DisBR("BNE", addr); break;
            case 0xD1: [dis, bytes] = this.DisIndY("CMP", addr); break;
            case 0xD5: [dis, bytes] = this.DisZPX("CMP", addr); break;
            case 0xD6: [dis, bytes] = this.DisZPX("DEC", addr); break;
            case 0xD8: dis = "CLD"; break;
            case 0xD9: [dis, bytes] = this.DisABSY("CMP", addr); break;
            case 0xDD: [dis, bytes] = this.DisABSX("CMP", addr); break;
            case 0xDE: [dis, bytes] = this.DisABSX("DEC", addr); break;

            case 0xE0: [dis, bytes] = this.DisIM("CPX", addr); break;
            case 0xE1: [dis, bytes] = this.DisIndX("SBC", addr); break;
            case 0xE4: [dis, bytes] = this.DisZP("CPX", addr); break;
            case 0xE5: [dis, bytes] = this.DisZP("SBC", addr); break;
            case 0xE6: [dis, bytes] = this.DisZP("INC", addr); break;
            case 0xE8: dis = "INX"; break;
            case 0xE9: [dis, bytes] = this.DisIM("SBC", addr); break;
            case 0xEA: dis = "NOP"; break;
            case 0xEC: [dis, bytes] = this.DisABS("CPX", addr); break;
            case 0xED: [dis, bytes] = this.DisABS("SBC", addr); break;
            case 0xEE: [dis, bytes] = this.DisABS("INC", addr); break;

            case 0xF0: [dis, conditional, addr2, bytes] = this.DisBR("BEQ", addr); break;
            case 0xF1: [dis, bytes] = this.DisIndY("SBC", addr); break;
            case 0xF5: [dis, bytes] = this.DisZPX("SBC", addr); break;
            case 0xF6: [dis, bytes] = this.DisZPX("INC", addr); break;
            case 0xF8: dis = "SED"; break;
            case 0xF9: [dis, bytes] = this.DisABSY("SBC", addr); break;
            case 0xFD: [dis, bytes] = this.DisABSX("SBC", addr); break;
            case 0xFE: [dis, bytes] = this.DisABSX("INC", addr); break;

            default:
                dis = "???"; break;
            //throw new Exception(string.Format("Invalid opcode {0:X2}", this.memory.get(addr]));
        }

        return [dis, conditional, bytes, addr2];
    }

    DisInd(opcode: string, addr: number): [string, number, number] {
        let bytes: number = 3;
        let addr1: number = this.GetNextWord(addr);
        let addr2: number = this.memory.get(addr1) | (this.memory.get(this.IncWord(addr1)) << 8);
        let dis: string = opcode + " ($" + Emu6502.toHex16(addr1) + ")";
        return [dis, addr2, bytes];
    }

    DisIndX(opcode: string, addr: number): [string, number] {
        let bytes: number = 2;
        let dis: string = opcode + " ($" + Emu6502.toHex8(this.memory.get(addr + 1)) + ",X)";
        return [dis, bytes];
    }

    DisIndY(opcode: string, addr: number): [string, number] {
        let bytes: number = 2;
        let dis: string = opcode + " ($" + Emu6502.toHex8(this.memory.get(addr + 1)) + "),Y";
        return [dis, bytes];
    }

    DisZP(opcode: string, addr: number): [string, number] {
        let bytes: number = 2;
        let dis: string = opcode + " $" + Emu6502.toHex8(this.memory.get(addr + 1));
        return [dis, bytes];
    }

    DisZPX(opcode: string, addr: number): [string, number] {
        let bytes: number = 2;
        let dis: string = opcode + " $" + Emu6502.toHex8(this.memory.get(addr + 1)) + ",X";
        return [dis, bytes];
    }

    DisZPY(opcode: string, addr: number): [string, number] {
        let bytes: number = 2;
        let dis: string = opcode + " $" + Emu6502.toHex8(this.memory.get(addr + 1)) + ",Y";
        return [dis, bytes];
    }

    DisABS(opcode: string, addr: number): [string, number] {
        let bytes: number = 3;
        let dis: string = opcode + " $" + Emu6502.toHex16(this.GetNextWord(addr));
        return [dis, bytes];
    }

    DisABSAddr(opcode: string, addr: number): [string, number, number] {
        let bytes: number = 3;
        let addr2 = this.GetNextWord(addr);
        let dis: string = opcode + " $" + Emu6502.toHex16(addr2);
        return [dis, addr2, bytes];
    }

    DisABSX(opcode: string, addr: number): [string, number] {
        let bytes: number = 3;
        let dis: string = opcode + " $" + Emu6502.toHex16(this.GetNextWord(addr)) + ",X";
        return [dis, bytes];
    }

    DisABSY(opcode: string, addr: number): [string, number] {
        let bytes: number = 3;
        let dis: string = opcode + " $" + Emu6502.toHex16(this.GetNextWord(addr)) + ",Y";
        return [dis, bytes];
    }

    DisIM(opcode: string, addr: number): [string, number] {
        let bytes: number = 2;
        let dis: string = opcode + " #$" + Emu6502.toHex8(this.memory.get(addr + 1));
        return [dis, bytes];
    }

    DisBR(opcode: string, addr: number): [string, boolean, number, number] {
        let bytes: number = 2;
        let conditional: boolean = true;
        let offset: number = this.sbyte(this.memory.get(addr + 1));
        let addr2: number = (addr + 2 + offset);
        let dis: string = opcode + " $" + Emu6502.toHex16(addr2);
        return [dis, conditional, addr2, bytes];
    }
}

// emud64.ts - Class EmuD64
//   1541 Disk Image Driver - access files, directory from disk image
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
class EmuD64
{
    // D64 File format documented at https://vice-emu.sourceforge.io/vice_16.html
    // and http://unusedino.de/ec64/technical/formats/d64.html

    private bytes = new Uint8Array(0);

    readonly n_tracks = 35;
    readonly bytes_per_sector = 256;
    readonly sectors_per_disk =
        (
            21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 + 21 +
            19 + 19 + 19 + 19 + 19 + 19 + 19 +
            18 + 18 + 18 + 18 + 18 + 18 +
            17 + 17 + 17 + 17 + 17
        );
    readonly bytes_per_disk = 256 * this.sectors_per_disk;
    readonly sectors_per_track =
        [   0, // there is no track 0
            21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,
            19,19,19,19,19,19,19,
            18,18,18,18,18,18,
            17,17,17,17,17,
        ];

    readonly dir_track = 18;
    readonly dir_sector = 1;
    readonly dir_entry_size = 32;
    readonly dir_entries_per_sector = this.bytes_per_sector / this.dir_entry_size;
    readonly bam_track = this.dir_track;
    readonly bam_sector = 0;
    readonly disk_name_offset = 0x90;
    readonly disk_name_size = 16;
    readonly disk_id_offset = 0xA2;
    readonly disk_id_size = 2;
    readonly disk_dos_type_offset = 0xA5;
    readonly disk_dos_type_size = 2;

    public constructor(bytes: Uint8Array)
    {
        if (bytes.length != this.bytes_per_disk)
            throw "only 35-track disks, no errors supported, expected exactly " + this.bytes_per_disk + " bytes";

        // make a new copy for ourselves
        this.bytes = new Uint8Array(bytes.length);
        for (let i=0; i<bytes.length; ++i)
            this.bytes[i] = bytes[i];
    }

    private GetSectorOffset(track: number, sector: number): number
    {
        if (track < 1 || track > this.n_tracks)
            throw "track " + track + " out of range, should be 1 to " + "n_tracks";
        if (sector < 0 || sector >= this.sectors_per_track[track])
            throw "sector " + sector + " out of range, should be 0 to " + this.sectors_per_track[track] + " for track " + track;
        let offset = 0;
        for (let t = 1; t < track; ++t)
            offset += this.sectors_per_track[t] * this.bytes_per_sector;
        offset += sector * this.bytes_per_sector;
        return offset;
    }

    public DirStruct = class DirStruct {
        static readonly dir_name_size = 16;
        readonly dir_unused_size = 6;
        public FileType = { DEL:0, SEQ:1, PRG:2, USR:3, REL:4 };

        public next_track: number;
        public next_sector: number;
        public file_type: number; // lower 4 bits, 4 unused, 5 for @SAVE, 6 for > Locked, 7 Closed otherwise *
        public file_track: number;
        public file_sector: number;
        public rel_track: number;
        public rel_sector: number;
        public filename: number[]; // 16 character, PETSCII, $A0 right padded
        public rel_length: number;
        public unused: number[]; // 6 bytes unused except GEOS disks
        public n_sectors: number; // 16-bit

        public constructor()
        {
            this.next_track = 0;
            this.next_sector = 0;
            this.file_type = this.FileType.DEL;
            this.file_track = 0;
            this.file_sector = 0;
            this.filename = [];
            for (let i = 0; i < DirStruct.dir_name_size; ++i)
                this.filename.push(0xA0);
            this.rel_track = 0;
            this.rel_sector = 0;
            this.rel_length = 0;
            this.unused = [];
            for (let i = 0; i < this.dir_unused_size; ++i)
                this.unused.push(0);
            this.n_sectors = 0;
        }

        public Read(d64: EmuD64, track: number, sector: number, n: number): void
        {
            if (n < 0 || n >= d64.dir_entries_per_sector)
                throw "directory index " + n + " out of range, expected 0 to " + (d64.dir_entries_per_sector - 1);
            let i = d64.GetSectorOffset(track, sector) + d64.dir_entry_size * n;
            this.ReadData(d64, d64.bytes, i);
        }

        private ReadData(d64: EmuD64, data: Uint8Array, offset: number): void
        {
            let save_offset = offset;
            this.next_track = data[offset++];
            this.next_sector = data[offset++];
            this.file_type = data[offset++];
            this.file_track = data[offset++];
            this.file_sector = data[offset++];
            this.filename = [];
            for (let i = 0; i < DirStruct.dir_name_size; ++i)
                this.filename.push(data[offset++]);
            this.rel_track = data[offset++];
            this.rel_sector = data[offset++];
            this.rel_length = data[offset++];
            this.unused = [];
            for (let i = 0; i < this.dir_unused_size; ++i)
                this.unused.push(data[offset++]);
            let lo = data[offset++];
            let hi = data[offset++];
            this.n_sectors = (lo + (hi << 8));
            if (offset != save_offset + d64.dir_entry_size)
                throw "internal error, expected to read " + d64.dir_entry_size + " bytes for directory entry, but read " + (offset - save_offset) + " bytes";
        }

        public static PrintableChar(i: number): string
        {
            let c = String.fromCharCode(i);
            if (c == '^')
                return '↑';
            else if (c == '_')
                return '←';
            else if (c == '[' || c == ']') // brackets
                return c;
            else if (i >= 32 && i <= 64) // punctuation
                return c;
            else if (c >= 'A' && c <= 'Z') // uppercase or lowercase
                return c; // uppercase
            else if (c >= 'a' && c <= 'z') // lowercase or graphics
                return String.fromCharCode(c.charCodeAt(0) - 'a'.charCodeAt(0) + 'A'.charCodeAt(0));
            else if (c == '\\')
                return '£';
            else if (i == 0xA0)
                return ' ';
            else
                return '?'; // not printable
        }

        public getName(): string {
            let s = "";
            for (let i=0; i<DirStruct.dir_name_size; ++i)
            {
                let c = this.filename[i];
                if (c == 0xA0)
                    break;
                s += DirStruct.PrintableChar(c);
            }
            return s;
        }

        public FileTypeString()
        {
            switch (this.file_type & 7)
            {
                case this.FileType.DEL:
                    return "DEL";
                case this.FileType.PRG:
                    return "PRG";
                case this.FileType.REL:
                    return "REL";
                case this.FileType.SEQ:
                    return "SEQ";
                case this.FileType.USR:
                    return "USR";
                default:
                    return "???";
                }
        }

        public toString(): any
        {
            let s = "";
            let n_s = this.n_sectors.toString();
            s += n_s;
            for (let i=1; i<=5-(n_s.length); ++i)
                s += " ";
            s += "\"";
            let i = 0;
            while (i < DirStruct.dir_name_size && this.filename[i] != 0xA0)
                s += DirStruct.PrintableChar(this.filename[i++]);
            s += "\"";
            while (i < DirStruct.dir_name_size)
                s += DirStruct.PrintableChar(this.filename[i++]);
            s += " ";
            s += this.FileTypeString();
            return s;
        }
    }

    private WalkDirectory(dirFn: (d64: EmuD64, dir: any, n: number, last: boolean, context: any) => [boolean, any], context: any): any
    {
        let track = this.dir_track;
        let sector = this.dir_sector;
        let next_track = 0;
        let next_sector = 0;
        let n = 0;
        let dir = new this.DirStruct();
        while (true)
        {
            dir.Read(this, track, sector, n % this.dir_entries_per_sector);
            if ((n % this.dir_entries_per_sector) == 0)
            {
                next_track = dir.next_track;
                next_sector = dir.next_sector;
            }
            let last : boolean = ((n % this.dir_entries_per_sector) == this.dir_entries_per_sector - 1 && next_track == 0);
            let cont : boolean;
            [cont, context] = dirFn(this, dir, n, last, context)
            if (!cont || last)
                break;
            if ((++n % this.dir_entries_per_sector) == 0)
            {
                track = next_track;
                sector = next_sector;
            }
        }
        return context;
    }

    private DirectoryCountHandler(d64: EmuD64, dir: any, n: number, last: boolean, context: any) : [boolean, any]
    {
        let total_count: number = context;
        ++total_count;
        context = total_count;
        return [true, context];
    }

    public GetDirectoryCount(): number
    {
        let total_count = 0;
        total_count = this.WalkDirectory(this.DirectoryCountHandler, total_count);
        return total_count;
    }

    // context is [number, DirStruct]
    private DirectoryEntryHandler(d64: EmuD64, dir: any, n: number, last: boolean, context: any): [boolean, any]
    {
        if (n == context[0])
        {
            context[1] = dir;
            return [false, context];
        }
        return [true, context];
    }

    public DirectoryEntry(i: number): any/*DirStruct*/
    {
        let dir: any;
        [i, dir] = this.WalkDirectory(this.DirectoryEntryHandler, [i, null]);
        return dir;
    }

    public DiskBAMField(field_offset: number, size: number): number[]
    {
        let field: number[] = [];
        let offset = this.GetSectorOffset(this.bam_track, this.bam_sector);
        for (let i = 0; i < size; ++i)
        {
            let value = this.bytes[offset + field_offset + i];
            field.push(value);
        }
        return field;
    }

    public DiskBAMPrintable(field_offset: number, size: number): string
    {
        let field: number[] = this.DiskBAMField(field_offset, size);
        let s = "";
        for (let i = 0; i < field.length; ++i)
        {
            let value = field[i];
            s += this.DirStruct.PrintableChar(value);
        }
        return s;
    }

    public DiskName(): string
    {
        return this.DiskBAMPrintable(this.disk_name_offset, this.disk_name_size);
    }

    public DiskId(): string
    {
        return this.DiskBAMPrintable(this.disk_id_offset, this.disk_id_size);
    }

    public DiskDosType(): string
    {
        return this.DiskBAMPrintable(this.disk_dos_type_offset, this.disk_dos_type_size);
    }

    public BlocksFree(): number
    {
        let total_free = 0;
        let offset = this.GetSectorOffset(this.bam_track, this.bam_sector);
        for (let track = 1; track <= this.n_tracks; ++track)
        {
            let track_free = this.bytes[offset + track * 4];
            if (track != this.dir_track && track != this.bam_track)
                total_free += track_free;
        }
        return total_free;
    }

    public ReadFileByIndex(i: number): Uint8Array
    {
        let dir = this.DirectoryEntry(i);
        let data : number[] = [];
        let track = (<any>dir).file_track;
        let sector = dir.file_sector;
        if ((<number>(dir.file_type) & 7) == <number>(dir.FileType.PRG))
        {
            while (true)
            {
                let offset = this.GetSectorOffset(track, sector);
                track = this.bytes[offset];
                sector = this.bytes[offset + 1];
                let limit = 256;
                if (track == 0)
                    limit = sector + 1;
                for (i = 2; i < limit; ++i)
                    data.push(this.bytes[offset + i]);
                if (track == 0)
                    break;
            }
        }
        return new Uint8Array(data);
    }

    private ReadFileByNameHandler(d64: EmuD64, dir: any, n: number, last: boolean, context: any): [boolean, any/*number*/]
    {
        let filename = <Uint8Array>context;
        let isPRG : boolean = ((<number>(dir.file_type) & 7) == <number>(dir.FileType.PRG));
        for (let i=0; i<this.DirStruct.dir_name_size; ++i)
        {
            if (i > 0 && filename[i] == 0xA0) // end of filename shortcut
                break;
            else if (filename[i] != dir.filename[i]) // no match
                return [true, context]; // keep looking
        }
        // full or shortcut match if got here
        return [false, n];
    }

    public ReadFileByName(filename: Uint8Array): Uint8Array
    {
        let result = this.WalkDirectory(this.ReadFileByNameHandler, filename);
        if (typeof result == 'number')
            return this.ReadFileByIndex(<number>result);
        else
            return new Uint8Array(0);
    }

    public GetDirectoryFormatted(): string
    {
        let s = "0 ";
        s += "\"" + this.DiskName() + "\" " + this.DiskId() + " " + this.DiskDosType() + "\n";
        let count = this.GetDirectoryCount();
        for (let i=0; i<count; ++i)
        {
            let dir = this.DirectoryEntry(i);
            let data = this.ReadFileByIndex(i);
            s += dir.toString() + " " + data.length + "\n";
        }
        s += this.BlocksFree() + " BLOCKS FREE.";
        return s;
    }

    private WriteByte(data: number[], byte: number): number[]
    {
        data.push(byte & 0xFF);
        return data;
    }

    private WriteBytes(data: number[], bytes: number[]): number[]
    {
        for (let i=0; i<bytes.length; ++i)
            data.push(bytes[i]);
        return data;
    }

    private WriteWord(data: number[], word: number): number[]
    {
        data.push(word & 0xFF);
        data.push(word >> 8);
        return data;
    }

    private WriteString(data: number[], s: string): number[]
    {
        for (let i=0; i<s.length; ++i)
            data.push(s.charCodeAt(i));
        return data;
    }

    // construct a Commodore program that represents the directory contents
    public GetDirectoryProgram(): Uint8Array
    {
        let disk_name = this.DiskBAMField(this.disk_name_offset, this.disk_name_size);
        let disk_id = this.DiskBAMField(this.disk_id_offset, this.disk_id_size);
        let dos_type = this.DiskBAMField(this.disk_dos_type_offset, this.disk_dos_type_size);

        let ptr = 0x801;
        let data = this.WriteWord([], ptr); // start with file size
        data = this.WriteWord(data, ptr+=0x1E); // next line pointer
        data = this.WriteWord(data, 0); // line number
        data = this.WriteByte(data, 18); // RVS
        data = this.WriteString(data, '"');
        for (let i=0; i<disk_name.length; ++i)
        {
            let value = disk_name[i];
            if (value == 0xA0)
                value = 0x20;
            data = this.WriteByte(data, value);
        }
        data = this.WriteString(data, '" ');
        data = this.WriteBytes(data, disk_id);
        data = this.WriteString(data, " ");
        data = this.WriteBytes(data, dos_type);
        data = this.WriteByte(data, 0);
        
        let count = this.GetDirectoryCount();
        for (let i=0; i<count; ++i)
        {
            let dir = this.DirectoryEntry(i);
            if ((dir.file_type & 7) == dir.FileType.PRG)
            {
                let next = data.length;
                data = this.WriteWord(data, 0); // will patch up next later
                data = this.WriteWord(data, dir.n_sectors); // line number
                for (let j = dir.n_sectors.toString().length; j <= 3; ++j)
                    data = this.WriteString(data, " ");
                data = this.WriteString(data, '"');
                let j = 0;
                while (j < this.DirStruct.dir_name_size && dir.filename[j] != 0xA0)
                    data = this.WriteByte(data, dir.filename[j++]);
                data = this.WriteString(data, '"');
                for (let k = j; k < this.DirStruct.dir_name_size + 1; ++k)
                    data = this.WriteString(data, " ");
                data = this.WriteString(data, dir.FileTypeString());
                data = this.WriteByte(data, 0);
                ptr += (data.length - next);
                data[next] = (ptr & 0xFF);
                data[next + 1] = (ptr >> 8);
            }
        }
        let next = data.length;
        data = this.WriteWord(data, 0); // will patch up next later
        data = this.WriteWord(data, this.BlocksFree()); // line number
        data = this.WriteString(data, "BLOCKS FREE.");
        data = this.WriteByte(data, 0)
        ptr += (data.length - next);
        data[next] = (ptr & 0xFF);
        data[next+1] = (ptr >> 8);
        data = this.WriteWord(data, 0);
        return new Uint8Array(data);
    }
} // class D64

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

class C64Memory implements Memory {
    protected ram: number[];
    protected io: number[];
    protected plotter: CharPlotter;

    // note ram starts at 0x0000
    basic_addr = 0xA000;
    kernal_addr = 0xE000;
    io_addr = 0xD000;
    io_size = 0x1000;
    color_addr = 0xD800;
    color_size = 0x0400;
    open_addr = 0xC000;
    open_size = 0x1000;

    constructor(ram_size: number, plotter: CharPlotter) {
        this.plotter = plotter;
        
        if (ram_size > 64 * 1024)
            ram_size = 64 * 1024;
        this.ram = [];

        let i: number;
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

    get(addr: number): number {
        if (redraw_screen)
        {
            this.redrawScreen();
            redraw_screen = false;
        }

        if (addr <= this.ram.length - 1 // note: handles option to have less than 64K RAM
            && (
                addr < this.basic_addr // always RAM
                || (addr >= this.open_addr && addr < this.open_addr + this.open_size) // always open RAM C000.CFFF
                || (((this.ram[1] & 3) != 3) && addr >= this.basic_addr && addr < this.basic_addr + basic_rom.length) // RAM banked instead of BASIC
                || (((this.ram[1] & 2) == 0) && addr >= this.kernal_addr && addr <= this.kernal_addr + kernal_rom.length - 1) // RAM banked instead of KERNAL
                || (((this.ram[1] & 3) == 0) && addr >= this.io_addr && addr < this.io_addr + this.io.length) // RAM banked instead of IO
            )
        )
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
                for (i=0; i<scancodes_irq.length; ++i) {
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
            else if (addr == 0xDC0D) { // Interrupt Control Register
                if (timerA_triggered)
                {
                    timerA_triggered = false;
                    return 0x81;
                }
                else
                    return 0;
            }
            else
                return this.io[addr - this.io_addr];
        }
        else if (addr >= this.kernal_addr && addr <= this.kernal_addr + kernal_rom.length - 1)
            return kernal_rom[addr - this.kernal_addr];
        else
            return 0xFF;
    }

    upperLower(): boolean {
        return (this.io[0x18] & 2) != 0;
    }

    set(addr: number, value: number): void {
        if (addr <= this.ram.length - 1  // note: handles option to have less than 64K RAM
            && (
                addr < this.io_addr // RAM, including open RAM, and RAM under BASIC
                || (addr >= this.kernal_addr && addr <= this.kernal_addr + kernal_rom.length - 1) // RAM under KERNAL
                || (((this.ram[1] & 7) == 0) && addr >= this.io_addr && addr < this.io_addr + this.io.length) // RAM banked in instead of IO
                || (((this.ram[1] & 4) == 0) && addr >= this.io_addr && addr < this.io_addr + this.io.length) // RAM under CHARROM instead of color RAM
            )
        ) {
            if (this.ram[addr] != value)
            {
                this.ram[addr] = value; // banked RAM, and RAM under ROM
                if (addr >= 1024 && addr < 2024) // screen memory // TODO: check registers
                {
                    let offset = addr - 1024;
                    let col = offset % 40;
                    let row = Math.floor(offset / 40);
                    this.plotter.draw(value, this.upperLower(), col*8, row*8, this.io[0x800 + offset], this.io[0x21]); // char, x, y, fg, bg
                }
            }
        }
        else if (addr == 0xD020) {// border
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
                    this.plotter.draw(this.ram[1024+offset], this.upperLower(), col*8, row*8, value, this.io[0x21]); // char x, y, fg, bg
                }
            }
        }
        else if (addr == 0xDC00) // write keyboard scan column
            this.io[addr - this.io_addr] = value;
        else if (addr == 0xDC0D) {
            switch (value & 0x81) {
                case 0x81:
                    timerA_enabled = true;
                    break;
                case 0x01:
                    timerA_enabled = false;
                    break;
            }
        }
        else if (addr == 0xDC0E) // Control Register A
            this.io[addr - this.io_addr] = value;
        else if (addr == 0xD018) { // VIC-II Chip Memory Control Register
            this.io[addr - this.io_addr] = value;
            this.redrawScreen(); // upper to lower or lower to upper
        }
    }

    redrawScreen() {
        let addr: number;

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

    getWorker(): Worker {
        return this.plotter.getWorker();
    }
}

class EmuC64 {
    protected cpu: Emu6502;
    protected memory: C64Memory;

    protected FileName: string = "";
    protected FileNum: number = 0;
    protected FileDev: number = 0;
    protected FileSec: number = 0;
    protected FileVerify: boolean = false;
    protected FileAddr: number = 0;

    protected LOAD_TRAP: number = -1;
    protected startup_state: number = 0;

    public StartupPRG: string = "";

    protected plotter: CharPlotter;

    public constructor(ram_size: number, plotter: CharPlotter) {
        this.memory = new C64Memory(ram_size, plotter);
        this.cpu = new Emu6502(this.memory, this.ExecutePatch, this);
        this.plotter = plotter;
    }

    public async ResetRun() {
        this.cpu.ResetRun();
    }

    private NMI = false;

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
    ExecutePatch(context: any): boolean {
        let found_NMI = false;
        for (let i=0; !found_NMI && i < scancodes_irq.length; ++i)
            if (scancodes_irq[i] == (1024+64).toString())
                found_NMI = true;
        if (context.NMI)
        {
            if (!found_NMI)
                context.NMI = false;
        }
        else if (found_NMI) // newly pressed, detected edge
        {
            context.NMI = true; // set so won't trigger again until cleared
            context.cpu.Push(context.cpu.HI(context.cpu.PC));
            context.cpu.Push(context.cpu.LO(context.cpu.PC));
            context.cpu.PHP();
            context.cpu.PC = (context.memory.get(0xFFFA) | (context.memory.get(0xFFFB) << 8)); // JMP(NMI)
            return true; // overriden, and PC changed, so caller should reloop before execution to allow breakpoint/trace/ExecutePatch/etc.
        }

        if (context.StartupPRG == "" && attach.length > 0)
        {
            if (attach.length == 683 * 256) // attach 1541 disk
            {
                let d64 = new EmuD64(attach);
                console.log(d64.GetDirectoryFormatted());
                let n = d64.GetDirectoryCount();
                context.files = [];
                for (let i=0; i<n; ++i)
                {
                    let dir = d64.DirectoryEntry(i);
                    let filename = dir.getName();
                    if ((dir.file_type & 7) == 2) // PRG
                    {
                        let bytes = d64.ReadFileByIndex(i);
                        let nums: number[] = [];
                        for (let j=0; j<bytes.length; ++j)
                            nums.push(bytes[j]);
                        if (nums.length > 0)
                            context.files.push([filename, nums]);
                        if (autoexec && context.StartupPRG.length == 0)
                            context.StartupPRG = filename;
                    }
                }
    
                // store directory
                let bytes = d64.GetDirectoryProgram();
                let nums: number[] = [];
                for (let j=0; j<bytes.length; ++j)
                    nums.push(bytes[j]);
                context.files.push(["$", nums]);

                // reset global
                attach = new Uint8Array(0);
            }
            else // just one program
            {
                context.files = [];
                let nums: number[] = [];
                for (let i=0; i<attach.length; ++i)
                    nums.push(attach[i]);
                if (nums.length > 0)
                    context.files.push(["ATTACH.PRG", nums]);
                // reset global
                attach = new Uint8Array(0);
            }
            if (autoexec) {
                if (context.StartupPRG.length == 0)
                    context.StartupPRG = "*";
                context.cpu.PC = (context.memory.get(0xFFFC) | (context.memory.get(0xFFFD) << 8)); // JMP(RESET)
                return true;
            }
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
            let name: string = "";
            let addr: number = context.cpu.X | (context.cpu.Y << 8);
            let i: number;
            for (i = 0; i < context.cpu.A; ++i)
                name += String.fromCharCode(context.memory.get(addr + i)).toString();
            console.log("SETNAM " + name);
            context.FileName = name;
        }
        else if (context.cpu.PC == 0xFFD5) // LOAD
        {
            context.FileAddr = context.cpu.X | (context.cpu.Y << 8);
            let op: string;
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
            let addr1: number = context.memory.get(context.cpu.A) | (context.memory.get((context.cpu.A + 1) & 0xFF) << 8);
            let addr2: number = context.cpu.X | (context.cpu.Y << 8);
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
                let is_basic: boolean;
                if (context.cpu.PC == context.LOAD_TRAP) {
                    is_basic = (
                        context.FileVerify == false
                        && context.FileSec == 0 // relative load, not absolute
                        && context.cpu.LO(context.FileAddr) == context.memory.get(43) // requested load address matches BASIC start
                        && context.cpu.HI(context.FileAddr) == context.memory.get(44)
                    );
                    let success: boolean;
                    let err: number;
                    [success, err] = context.FileLoad();
                    if (!success) {
                        console.log("FileLoad() failed: err=" + err + ", file " + context.StartupPRG);
                        context.cpu.C = true; // signal error
                        context.cpu.SetA(err); // FILE NOT FOUND or VERIFY

                        // so doesn't repeat
                        context.StartupPRG = "";
                        context.LOAD_TRAP = -1;
                        attach = new Uint8Array(0);

                        return true; // overriden, and PC changed, so caller should reloop before execution to allow breakpoint/trace/ExecutePatch/etc.
                    }
                }
                else {
                    context.FileName = context.StartupPRG;
                    context.FileAddr = context.memory.get(43) | (context.memory.get(44) << 8);
                    is_basic = context.LoadStartupPrg();
                }

                context.StartupPRG = "";
                attach = new Uint8Array(0);

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
                    let addr: number = context.memory.get(43) | (context.memory.get(44) << 8);
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
                let addr: number = context.memory.get(0x22) + (context.memory.get(0x23) << 8) + 2;
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

    protected ExecuteRTS(): boolean {
        this.cpu.RTS();
        return true; // return value for ExecutePatch so will reloop execution to allow berakpoint/trace/ExecutePatch/etc.
    }

    protected ExecuteJSR(addr: number): boolean {
        let retaddr: number = (this.cpu.PC - 1) & 0xFFFF;
        this.cpu.Push(this.cpu.HI(retaddr));
        this.cpu.Push(this.cpu.LO(retaddr));
        this.cpu.PC = addr;
        return true; // return value for ExecutePatch so will reloop execution to allow berakpoint/trace/ExecutePatch/etc.
    }

    // returns true if BASIC (and succeeded)
    protected LoadStartupPrg(): boolean {
        let result: boolean;
        let err: number;
        [result, err] = this.FileLoad();
        if (!result)
            return false;
        else
            return this.FileSec == 0 ? true : false; // relative is BASIC, absolute is ML
    }

    private files : [string, number[]][] = [
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
            0x25, 0x22, 0x00, 0x00, 0x00]],
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
            0x99, 0x20, 0x22, 0x20, 0x9e, 0x43, 0x36, 0x34, 0x45, 0x4d, 0x55, 0x2e, 0x44, 0x41, 0x56, 0x45,
            0x56, 0x57, 0x2e, 0x43, 0x4f, 0x4d, 0x05, 0x20, 0x9a, 0x12, 0x43, 0x4f, 0x4d, 0x4d, 0x4f, 0x44,
            0x4f, 0x52, 0x45, 0x20, 0x36, 0x34, 0x20, 0x53, 0x55, 0x42, 0x53, 0x45, 0x54, 0x22, 0x00, 0x94,
            0x08, 0x5a, 0x00, 0x99, 0x00, 0x9e, 0x08, 0x6e, 0x00, 0x99, 0x20, 0x22, 0x05, 0x22, 0x00, 0xce,
            0x08, 0x78, 0x00, 0x99, 0x20, 0x22, 0x20, 0x43, 0x4c, 0x49, 0x43, 0x4b, 0x3a, 0x20, 0x9f, 0x53,
            0x52, 0x43, 0x2e, 0x44, 0x41, 0x56, 0x45, 0x56, 0x57, 0x2e, 0x43, 0x4f, 0x4d, 0x05, 0x20, 0x98,
            0x3e, 0x05, 0x20, 0x54, 0x53, 0x2d, 0x45, 0x4d, 0x55, 0x2d, 0x43, 0x36, 0x34, 0x22, 0x00, 0xef,
            0x08, 0x82, 0x00, 0x99, 0x20, 0x22, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x9f, 0xb7,
            0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0xb7, 0x20, 0x22, 0x00,
            0xf5, 0x08, 0x87, 0x00, 0x99, 0x00, 0x2c, 0x09, 0x8c, 0x00, 0x99, 0x20, 0x22, 0x20, 0x1e, 0x45,
            0x53, 0x43, 0x98, 0x3d, 0x99, 0x53, 0x54, 0x4f, 0x50, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
            0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x1e, 0x50, 0x47, 0x55, 0x50, 0x98, 0x3d, 0x99, 0x52, 0x45,
            0x53, 0x54, 0x4f, 0x52, 0x45, 0x98, 0x2f, 0x99, 0x4e, 0x4d, 0x49, 0x22, 0x00, 0x5c, 0x09, 0xa0,
            0x00, 0x99, 0x20, 0x22, 0x20, 0x1e, 0x41, 0x4c, 0x54, 0x2f, 0x43, 0x54, 0x52, 0x4c, 0x98, 0x3d,
            0x99, 0x43, 0x4f, 0x4d, 0x4d, 0x4f, 0x44, 0x4f, 0x52, 0x45, 0x20, 0x20, 0x20, 0x1e, 0x54, 0x41,
            0x42, 0x98, 0x3d, 0x99, 0x43, 0x4f, 0x4e, 0x54, 0x52, 0x4f, 0x4c, 0x22, 0x00, 0x93, 0x09, 0xaa,
            0x00, 0x99, 0x20, 0x22, 0x20, 0x1e, 0x42, 0x41, 0x43, 0x4b, 0x53, 0x50, 0x41, 0x43, 0x45, 0x98,
            0x2f, 0x1e, 0x44, 0x45, 0x4c, 0x45, 0x54, 0x45, 0x98, 0x3d, 0x99, 0x44, 0x45, 0x4c, 0x20, 0x1e,
            0x49, 0x4e, 0x53, 0x98, 0x3d, 0x99, 0x53, 0x48, 0x49, 0x46, 0x54, 0x98, 0x2b, 0x99, 0x49, 0x4e,
            0x53, 0x54, 0x22, 0x00, 0xc3, 0x09, 0xb4, 0x00, 0x99, 0x20, 0x22, 0x20, 0x1e, 0xcd, 0x20, 0x42,
            0x41, 0x43, 0x4b, 0x53, 0x4c, 0x41, 0x53, 0x48, 0x98, 0x3d, 0x99, 0x5c, 0x20, 0x20, 0x20, 0x20,
            0x20, 0x20, 0x20, 0x20, 0x1e, 0x46, 0x39, 0x05, 0x3d, 0x54, 0x48, 0x49, 0x53, 0x20, 0x48, 0x45,
            0x4c, 0x50, 0x22, 0x00, 0xc9, 0x09, 0xbe, 0x00, 0x99, 0x00, 0xef, 0x09, 0xc8, 0x00, 0x99, 0x20,
            0x22, 0x20, 0x1c, 0x54, 0x45, 0x58, 0x54, 0x20, 0x4d, 0x4f, 0x44, 0x45, 0x20, 0x4f, 0x4e, 0x4c,
            0x59, 0x2c, 0x20, 0x4e, 0x4f, 0x20, 0x47, 0x52, 0x41, 0x50, 0x48, 0x49, 0x43, 0x53, 0x22, 0x00,
            0x1b, 0x0a, 0xd2, 0x00, 0x99, 0x20, 0x22, 0x20, 0x56, 0x45, 0x52, 0x59, 0x20, 0x4c, 0x49, 0x4d,
            0x49, 0x54, 0x45, 0x44, 0x20, 0x48, 0x57, 0x20, 0x52, 0x45, 0x47, 0x49, 0x53, 0x54, 0x45, 0x52,
            0x20, 0x45, 0x4d, 0x55, 0x4c, 0x41, 0x54, 0x49, 0x4f, 0x4e, 0x22, 0x00, 0x4b, 0x0a, 0xdc, 0x00,
            0x99, 0x20, 0x22, 0x20, 0x05, 0x44, 0x52, 0x41, 0x47, 0x26, 0x44, 0x52, 0x4f, 0x50, 0x20, 0x54,
            0x4f, 0x20, 0x41, 0x54, 0x54, 0x41, 0x43, 0x48, 0x20, 0x50, 0x52, 0x47, 0x20, 0x4f, 0x52, 0x20,
            0x2e, 0x44, 0x36, 0x34, 0x98, 0x28, 0x52, 0x4f, 0x29, 0x05, 0x22, 0x00, 0x80, 0x0a, 0xdd, 0x00,
            0x99, 0x20, 0x22, 0x20, 0x05, 0x2b, 0x1e, 0x43, 0x54, 0x52, 0x4c, 0x98, 0x2f, 0x99, 0x43, 0x3d,
            0x05, 0x20, 0x54, 0x4f, 0x20, 0x41, 0x55, 0x54, 0x4f, 0x45, 0x58, 0x45, 0x43, 0x2c, 0x20, 0x53,
            0x41, 0x56, 0x45, 0x20, 0x54, 0x4f, 0x20, 0x44, 0x4f, 0x57, 0x4e, 0x4c, 0x4f, 0x41, 0x44, 0x22,
            0x00, 0x86, 0x0a, 0xe6, 0x00, 0x99, 0x00, 0xb2, 0x0a, 0xf0, 0x00, 0x99, 0x20, 0x22, 0x20, 0x81,
            0x2a, 0x2a, 0x2a, 0x46, 0x49, 0x52, 0x45, 0x46, 0x4f, 0x58, 0x20, 0x42, 0x52, 0x4f, 0x57, 0x53,
            0x45, 0x52, 0x20, 0x52, 0x45, 0x43, 0x4f, 0x4d, 0x4d, 0x45, 0x4e, 0x44, 0x45, 0x44, 0x2a, 0x2a,
            0x2a, 0x22, 0x00, 0xb8, 0x0a, 0xfa, 0x00, 0x99, 0x00, 0xcb, 0x0a, 0x04, 0x01, 0x99, 0x20, 0x22,
            0x20, 0x98, 0x4f, 0x50, 0x54, 0x49, 0x4f, 0x4e, 0x53, 0x3a, 0x22, 0x00, 0xd1, 0x0a, 0x0e, 0x01,
            0x99, 0x00, 0x01, 0x0b, 0x18, 0x01, 0x99, 0x20, 0x22, 0x20, 0x05, 0x12, 0x5b, 0x20, 0x5d, 0x92,
            0x20, 0x4d, 0x4f, 0x42, 0x49, 0x4c, 0x45, 0x20, 0x4b, 0x45, 0x59, 0x42, 0x4f, 0x41, 0x52, 0x44,
            0x20, 0x43, 0x4f, 0x4e, 0x54, 0x52, 0x4f, 0x4c, 0x53, 0x20, 0x4e, 0x45, 0x45, 0x44, 0x45, 0x44,
            0x22, 0x00, 0x07, 0x0b, 0x22, 0x01, 0x99, 0x00, 0x27, 0x0b, 0x36, 0x01, 0x99, 0x20, 0x22, 0x20,
            0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
            0x12, 0x5b, 0x4f, 0x4b, 0x5d, 0x92, 0x22, 0x00, 0x37, 0x0b, 0xe4, 0x03, 0x99, 0x20, 0x22, 0x91,
            0x91, 0x91, 0x1d, 0x1d, 0x12, 0x22, 0x3b, 0x00, 0x4a, 0x0b, 0xe5, 0x03, 0xa1, 0x41, 0x24, 0x3a,
            0x8b, 0x41, 0x24, 0xb2, 0x22, 0x22, 0xa7, 0x39, 0x39, 0x37, 0x00, 0x74, 0x0b, 0xe6, 0x03, 0x8b,
            0x41, 0x24, 0xb2, 0x22, 0x20, 0x22, 0xa7, 0x54, 0xb2, 0x31, 0xab, 0x54, 0x3a, 0x99, 0xca, 0x28,
            0x22, 0x20, 0x58, 0x22, 0x2c, 0x54, 0xaa, 0x31, 0x2c, 0x31, 0x29, 0x22, 0x9d, 0x22, 0x3b, 0x3a,
            0x89, 0x39, 0x39, 0x37, 0x00, 0x7a, 0x0b, 0xe7, 0x03, 0x80, 0x00, 0x00, 0x00]],
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

    protected OpenRead(filename: string) : number[]
    {
        var i: number;
        for (i=0; i<this.files.length; ++i) {
            if (this.files[i][0] == filename 
                || 
                filename[0] != "$" && (this.files.length == 1 || filename == "0:*" || filename == "*" || filename == ":*")
            ) {
                let data = [];
                for (let j=0; j<this.files[i][1].length; ++j)
                    data[j] = this.files[i][1][j];
                return data; // return a copy so source not modified
            }
        }
        return [];
    }

    // returns success
    protected FileLoad(): [boolean, number] {
        let startup: boolean = (this.StartupPRG != null);
        let addr: number = this.FileAddr;
        let success: boolean = true;
        let err: number = 0;
        let filename: string = this.StartupPRG;
        let stream: number[] = this.OpenRead(filename);
        if (stream.length == 0) {
            err = 4; // FILE NOT FOUND
            success = false;
            this.FileAddr = addr;
            return [success, err];
        }

        let lo: number = stream.splice(0,1)[0];
        let hi: number = stream.splice(0,1)[0];
        if (startup) {
            if (lo == 1)
                this.FileSec = 0;
            else
                this.FileSec = 1;
        }
        if (this.FileSec == 1) // use address in file? yes-use, no-ignore
            addr = lo | (hi << 8); // use address specified in file
        let i: number;
        while (success) {
            if (stream.length > 0) {
                i = stream.splice(0,1)[0];
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

    protected FileSave(filename: string, addr1: number, addr2: number): boolean {
        if (filename.length == 0)
            filename = "FILENAME";
        if (!filename.toUpperCase().endsWith(".PRG"))
            filename += ".PRG";
        var stream: number[] = [];
        stream.push(this.cpu.LO(addr1));
        stream.push(this.cpu.HI(addr1));
        var addr: number
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
    seen: number[] = [];

    Reset() {
        this.seen = [];
    }

    Walk(cpu: Emu6502, addr: number) {
        let conditional: boolean;
        let bytes: number;
        let addr2: number;
        let branches: number[] = [];

        while (true) {
            if (this.seen.indexOf(addr) >= 0) {
                while (true) {
                    if (branches.length == 0)
                        return; // done with walk
                    else {
                        addr = branches.splice(0,1)[0]; // walk a saved address
                        if (this.seen.indexOf(addr) < 0)
                            break;
                    }
                }
            }
            let line: string;
            let dis: string;
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
                        addr = branches.splice(0,1)[0]; // walk a saved address
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

class CharPlotter
{
    worker: Worker;

    constructor(worker: Worker) {
        this.worker = worker;
    }

    public draw(c: number, mixedcase: boolean, x: number, y: number, fg: number, bg: number)
    {
        let j = (c + (mixedcase ? 256 : 0)) * 8;
        let chardata = [
            char_rom[j],
            char_rom[j+1],
            char_rom[j+2],
            char_rom[j+3],
            char_rom[j+4],
            char_rom[j+5],
            char_rom[j+6],
            char_rom[j+7]
        ];

        this.worker.postMessage(["char", chardata, x, y, fg, bg]);
    }

    public border(color: number)
    {
        this.worker.postMessage(["border", color]);
    }

    public getWorker(): Worker
    {
        return this.worker;
    }
}

function worker_function() {
    const worker: Worker = self as any;
    let c64 = new EmuC64(64*1024, new CharPlotter(worker));
    //c64.Walk([]);
    c64.ResetRun();
    console.log("done");
}

onmessage = function(e : MessageEvent) {
    //console.log("worker received: " + e.data)
    if (typeof e.data == "object") {
        if (typeof e.data.keys == "string") {
            //console.log("rcvd keys: " + e.data.keys);
            scancodes_queue.push(e.data.keys);
        }
        else if (e.data.basic && e.data.kernal && e.data.char)
        {
            basic_rom = e.data.basic;
            kernal_rom = e.data.kernal;
            char_rom = e.data.char;
        }
        else if (e.data.redraw == true)
        {
            redraw_screen = true;            
        }
        else if (e.data.autoexec)
        {
            attach = e.data.autoexec;
            autoexec = true;
        }
        else if (e.data.attach)
        {
            attach = e.data.attach;
            autoexec = false;
        }
    }
    //postMessage(["ack"], "onmessage");
}

worker_function();
