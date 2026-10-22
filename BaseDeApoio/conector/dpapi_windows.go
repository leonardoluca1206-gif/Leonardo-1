//go:build windows

package main

// A senha do Firebird fica protegida pelo Windows (DPAPI): só o mesmo usuário, no mesmo computador, consegue abrir.

import (
	"syscall"
	"unsafe"
)

type dataBlob struct {
	cbData uint32
	pbData *byte
}

var (
	crypt32            = syscall.NewLazyDLL("crypt32.dll")
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	procCryptProtect   = crypt32.NewProc("CryptProtectData")
	procCryptUnprotect = crypt32.NewProc("CryptUnprotectData")
	procLocalFree      = kernel32.NewProc("LocalFree")
)

func blob(d []byte) *dataBlob {
	if len(d) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{cbData: uint32(len(d)), pbData: &d[0]}
}

func (b *dataBlob) bytes() []byte {
	out := make([]byte, b.cbData)
	copy(out, unsafe.Slice(b.pbData, b.cbData))
	return out
}

func protegerSenha(s string) ([]byte, string, error) {
	var out dataBlob
	r, _, err := procCryptProtect.Call(uintptr(unsafe.Pointer(blob([]byte(s)))), 0, 0, 0, 0, 0x1, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return nil, "", err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	return out.bytes(), "dpapi", nil
}

func abrirSenha(d []byte, metodo string) (string, error) {
	if metodo != "dpapi" {
		return abrirSimples(d)
	}
	var out dataBlob
	r, _, err := procCryptUnprotect.Call(uintptr(unsafe.Pointer(blob(d))), 0, 0, 0, 0, 0x1, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return "", err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	return string(out.bytes()), nil
}
