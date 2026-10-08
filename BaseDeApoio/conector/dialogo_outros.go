//go:build !windows

package main

import "errors"

func escolherArquivoBanco(inicial string) (string, bool, error) {
	return "", false, errors.New("a janela de escolha de arquivo só existe no Windows; digite o caminho")
}
