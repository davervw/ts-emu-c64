# ts-emu-c64
TypeScript implementation of C64 Emulation (Commodore 64)

Try it out -> http://c64emu.davevw.com

![About ts-emu-c64](https://github.com/davervw/ts-emu-c64/raw/master/emuc64-about.png)

This project began as a port of my text mode 6502/C64 emulator [simple-emu-c64](https://github.com/davervw/simple-emu-c64) from C# to TypeScript, and is a learning experience with TypeScript/JavaScript.

It includes a port of the keyboard driver from my [C64-stm429_discovery](https://os.mbed.com/users/davervw/code/C64-stm429_discovery/) project, and rough adaptation of the memory mapped screen/color driver from the same project.

By no means is this a cycle accurate or true simulation of the Commodore 64.  It is a simple subset of enough of the system to appear like a C64 on the surface.  Sure it's running 6502 machine code, with the same C64 subsystems to get to the READY prompt, and has BASIC, and can do simple programs.  But there is no sprites, no graphics, no custom characters, no cartridge support, no joysticks, no disk/tape support, so no game support, and very limited hardware emulation whatsoever.  Just enough emulation to run simple programs.

The initial release has a simple program implementation where BASIC and binary files can be loaded into memory from a hardcoded array.  There are plans to expand on this to make it a bit more expandable.

THIS EMULATOR WILL ***NOT*** RUN GAMES.

The Commodore 64 ROMs are included for educational purposes and not licensed whatsoever.

To compile the code, you need node.js/npm, and typescript installed.  My development environment is using Visual Code, you can use something else.   Typescript is used to transpile into JavaScript.  The implementation uses a canvas in html, and a web worker for running the 6502 in the background.  Normally web browsers won't load a web worker as is from the local file system, so using a web server is recommended to serve up the pages from port 80, or whatever you like (left as an exercise to the user).

The release requires index.html, the *.js files, and FireFox is the recommended browser as it gives the best keyboard emulation.  Ctrl or ALT is the Commodore key, Tab is the Control key.  See [c64-kbd.ts](https://github.com/davervw/ts-emu-c64/blob/master/c64-kbd.ts) for full keyboard table diagrams.  Hint: ESC is Stop.

### Known Issues ###

>Because Ctrl+W closes the web browser with Firefox/Chrome, Alt is implemented as the Commodore Key.  Known bug (feature?) with Firefox.

>Keyboard emulation isn't great with Google Chrome/Chromium currently.   The web client acts blocked while a key is down and doesn't paint on screen until you let go.
