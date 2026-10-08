//go:build !windows

package main

func protegerSenha(s string) ([]byte, string, error) { return protegerSimples(s), "simples", nil }

func abrirSenha(d []byte, metodo string) (string, error) { return abrirSimples(d) }
