//go:build windows

package main

// Janela "Abrir arquivo" do Windows, para escolher o .fdb sem digitar o caminho.

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

type openFileName struct {
	lStructSize       uint32
	hwndOwner         uintptr
	hInstance         uintptr
	lpstrFilter       *uint16
	lpstrCustomFilter *uint16
	nMaxCustFilter    uint32
	nFilterIndex      uint32
	lpstrFile         *uint16
	nMaxFile          uint32
	lpstrFileTitle    *uint16
	nMaxFileTitle     uint32
	lpstrInitialDir   *uint16
	lpstrTitle        *uint16
	flags             uint32
	nFileOffset       uint16
	nFileExtension    uint16
	lpstrDefExt       *uint16
	lCustData         uintptr
	lpfnHook          uintptr
	lpTemplateName    *uint16
	pvReserved        uintptr
	dwReserved        uint32
	flagsEx           uint32
}

var (
	comdlg32            = syscall.NewLazyDLL("comdlg32.dll")
	user32              = syscall.NewLazyDLL("user32.dll")
	procGetOpenFileName = comdlg32.NewProc("GetOpenFileNameW")
	procCommDlgErr      = comdlg32.NewProc("CommDlgExtendedError")
	procForeground      = user32.NewProc("GetForegroundWindow")
)

func utf16Multi(partes ...string) *uint16 { // "a\x00b\x00\x00"
	var out []uint16
	for _, p := range partes {
		u, _ := syscall.UTF16FromString(p)
		out = append(out, u...)
	}
	out = append(out, 0)
	return &out[0]
}

func escolherArquivoBanco(inicial string) (string, bool, error) {
	type res struct {
		caminho string
		ok      bool
		err     error
	}
	ch := make(chan res, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		buf := make([]uint16, 1024)
		dir := ""
		if inicial != "" {
			if st, err := os.Stat(inicial); err == nil && !st.IsDir() {
				dir = filepath.Dir(inicial)
				nome, _ := syscall.UTF16FromString(filepath.Base(inicial))
				copy(buf, nome)
			} else if err == nil {
				dir = inicial
			}
		}
		if dir == "" {
			for _, d := range []string{`C:\Sist\ProSindW`, `C:\Sist`, `C:\`} {
				if _, err := os.Stat(d); err == nil {
					dir = d
					break
				}
			}
		}
		owner, _, _ := procForeground.Call()
		titulo, _ := syscall.UTF16PtrFromString("Escolha o banco do ProSindW (.fdb)")
		ofn := openFileName{
			hwndOwner:    owner,
			lpstrFilter:  utf16Multi("Banco Firebird (*.fdb; *.gdb)", "*.fdb;*.gdb", "Todos os arquivos", "*.*"),
			nFilterIndex: 1,
			lpstrFile:    &buf[0],
			nMaxFile:     uint32(len(buf)),
			lpstrTitle:   titulo,
			flags:        0x00001000 | 0x00000800 | 0x00000008 | 0x00080000 | 0x00000004, // FILEMUSTEXIST|PATHMUSTEXIST|NOCHANGEDIR|EXPLORER|HIDEREADONLY
		}
		if dir != "" {
			ofn.lpstrInitialDir, _ = syscall.UTF16PtrFromString(dir)
		}
		ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
		r, _, _ := procGetOpenFileName.Call(uintptr(unsafe.Pointer(&ofn)))
		if r == 0 {
			if code, _, _ := procCommDlgErr.Call(); code != 0 {
				ch <- res{err: errors.New("o Windows não abriu a janela de arquivos")}
				return
			}
			ch <- res{} // cancelado
			return
		}
		ch <- res{caminho: syscall.UTF16ToString(buf), ok: true}
	}()
	r := <-ch
	return r.caminho, r.ok, r.err
}
