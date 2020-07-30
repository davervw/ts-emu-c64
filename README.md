# ts-emu-c64
TypeScript implementation of C64 Emulation (Commodore 64) for Web Browser (e.g. Firefox)
including read-only D64 (1541) disk image support (drag & drop)

Try it out -> http://c64emu.davevw.com

![About ts-emu-c64](https://github.com/davervw/ts-emu-c64/raw/master/emuc64-about.png)

This project began as a port of my text mode 6502/C64 emulator [simple-emu-c64](https://github.com/davervw/simple-emu-c64) from C# to TypeScript, and is a learning experience with TypeScript/JavaScript.

It includes a port of the keyboard driver from my [C64-stm429_discovery](https://os.mbed.com/users/davervw/code/C64-stm429_discovery/) project, and rough adaptation of the memory mapped screen/color driver from the same project.

By no means is this a cycle accurate or true simulation of the Commodore 64.  It is a simple subset of enough of the system to appear like a C64 on the surface.  Sure it's running 6502 machine code, with the same C64 subsystems to get to the READY prompt, and has BASIC, and can do simple programs.  But there is no sprites, no graphics, no custom characters, no cartridge support, no joysticks, no cassette support, so no game support, and very limited hardware emulation whatsoever.  Just enough emulation to run simple programs.

The initial release has a simple program implementation where BASIC and binary files can be loaded into memory from a hardcoded array (hint: LOAD"$",8).  And supports drag & drop of PRG file (BASIC is autorun, machine code is loaded at absolute address), and SAVE will prompt you to download your PRG file.  You can also drag & drop D64 images and they will mount.   If keyboard Ctrl or Alt is held down during drop operation, system will reset, attach the program/disk and autorun the first program.

THIS EMULATOR WILL ***NOT*** RUN YOUR STANDARD GAMES.

The Commodore 64 ROMs are included for educational purposes and not licensed whatsoever.

To compile the code, you need node.js/npm, and typescript installed.  My development environment is using Visual Code, you can use something else.   Typescript is used to transpile into JavaScript.  The implementation uses a canvas in html, and a web worker for running the 6502 in the background.  Normally web browsers won't load a web worker as is from the local file system, so using a web server is recommended to serve up the pages from port 80, or whatever you like (left as an exercise to the user).

The release requires index.html, the *.js files, the emuc64-about*.png files, and FireFox is the recommended browser as it gives the best keyboard emulation.  Ctrl or ALT is the Commodore key, Tab is the Control key.  Hint: ESC is Stop.

PC to Commodore keyboard symbolic mapping:
  
    STOP(ESC) F1 F2 F3 F4 F5 F6 F7 F8 Help(F9)                  Run/Stop(Pause/Break)
              1! 2@ 3# 4$ 5% 6^ 7& 8* 9( 0) -_ += DelIns Ins HmClr Rstr     / * -
    Ctrl(Tab) Q  W  E  R  T  Y  U  I  O  P  [  ]  £ (\)  Del       (PUp)  7 8 9 +
              A  S  D  F  G  H  J  K  L  ;: '" Return                     4 5 6
    LShift    Z  X  C  V  B  N  M  ,< .> /?  RShift            Up         1 2 3
    C=(Ctrl)           SPACEBAR              C=(Ctrl)    Lft  Down  Rt    0 .   Enter

### Known Issues ###

>Keyboard emulation isn't great with Google Chrome/Chromium currently.   The web client acts blocked while a key is down and doesn't paint on screen until you let go.  STOP isn't working with Google Chrome for some reason as well, so careful with recursion.

>Because Ctrl+W closes the web browser with Firefox/Chrome, Alt is also implemented as the Commodore Key (choose your keystroke wisely!).  Known bug (feature?) with Firefox/Chrome.

Also see description of this project at [blog.davevw.com](https://techwithdave.davevw.com/2020/07/commodore-64-running-in-web-browser.html)

![breadbin](https://github.com/davervw/ts-emu-c64/raw/master/breadbin.jpg)
