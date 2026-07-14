package main

import (
	"archive/zip"
	"flag"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
)

type archiveFile struct {
	source string
	name   string
}

func main() {
	var output string
	var root string
	var binary string
	var script string
	var readme string

	flag.StringVar(&output, "output", "", "output ZIP path")
	flag.StringVar(&root, "root", "skillctl-windows-amd64", "top-level directory in the ZIP")
	flag.StringVar(&binary, "binary", "", "skillctl Windows executable path")
	flag.StringVar(&script, "script", "", "PowerShell installer path")
	flag.StringVar(&readme, "readme", "", "Windows installation guide path")
	flag.Parse()

	if output == "" || binary == "" || script == "" || readme == "" {
		fmt.Fprintln(os.Stderr, "output, binary, script, and readme are required")
		os.Exit(2)
	}

	files := []archiveFile{
		{source: binary, name: "skillctl-windows-amd64.exe"},
		{source: script, name: "install-skillctl.ps1"},
		{source: readme, name: "README-Windows.txt"},
	}
	if err := createArchive(output, root, files); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func createArchive(output, root string, files []archiveFile) (err error) {
	if err := os.MkdirAll(filepath.Dir(output), 0o755); err != nil {
		return err
	}

	tmp := output + ".tmp"
	_ = os.Remove(tmp)
	defer func() {
		if err != nil {
			_ = os.Remove(tmp)
		}
	}()

	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(f)

	for _, file := range files {
		if err = addFile(zw, file.source, path.Join(root, file.name)); err != nil {
			_ = zw.Close()
			_ = f.Close()
			return err
		}
	}
	if err = zw.Close(); err != nil {
		_ = f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(tmp, output); err != nil {
		return err
	}
	return nil
}

func addFile(zw *zip.Writer, source, name string) error {
	f, err := os.Open(source)
	if err != nil {
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = name
	header.Method = zip.Deflate

	w, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, f)
	return err
}
