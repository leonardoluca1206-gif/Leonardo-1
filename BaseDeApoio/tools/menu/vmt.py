"""Localiza a VMT de uma classe Delphi e lê a tabela de métodos publicados; extrai literais referenciados pelo código."""
import struct, re, pefile

class Bin:
    def __init__(self, caminho):
        self.pe = pefile.PE(caminho, fast_load=True)
        self.data = open(caminho, 'rb').read()
        self.base = self.pe.OPTIONAL_HEADER.ImageBase
        self.code = next(s for s in self.pe.sections if s.Name.startswith(b'CODE'))
        self.cini = self.base + self.code.VirtualAddress
        self.cfim = self.cini + self.code.Misc_VirtualSize

    def off(self, va):
        return self.pe.get_offset_from_rva(va - self.base)

    def va(self, off):
        return self.pe.get_rva_from_offset(off) + self.base

    def u32(self, va):
        return struct.unpack_from('<I', self.data, self.off(va))[0]

    def vmt(self, classe):
        alvo = bytes([len(classe)]) + classe.encode()
        for m in re.finditer(re.escape(alvo), self.data):
            try:
                sva = self.va(m.start())
            except Exception:
                continue
            ptr = struct.pack('<I', sva)
            for m2 in re.finditer(re.escape(ptr), self.data):
                cand = self.va(m2.start()) + 44
                try:
                    if self.u32(cand - 76) == cand:
                        return cand
                except Exception:
                    pass
        return None

    def metodos(self, vmt):
        res = {}
        c = vmt
        while c:
            mt = self.u32(c - 52)
            if mt:
                o = self.off(mt)
                n = struct.unpack_from('<H', self.data, o)[0]; o += 2
                for _ in range(n):
                    size, addr = struct.unpack_from('<HI', self.data, o)
                    nl = self.data[o + 6]
                    nome = self.data[o + 7:o + 7 + nl].decode('latin-1')
                    res.setdefault(nome, addr)
                    o += size
            par = self.u32(c - 36)
            c = self.u32(par) if par else 0
        return res

    def literal(self, va):
        """AnsiString literal: [-8]=refcount(-1) [-4]=len, dados em va."""
        if not (self.cini <= va < self.cfim):
            return None
        try:
            o = self.off(va)
            rc, ln = struct.unpack_from('<iI', self.data, o - 8)
        except Exception:
            return None
        if rc != -1 or not (0 < ln < 400):
            return None
        s = self.data[o:o + ln]
        if b'\0' in s:
            return None
        return s.decode('cp1252', 'replace')

    def strings_em(self, ini, fim):
        """Literais referenciados por imediatos de 32 bits no trecho de código [ini, fim)."""
        o1, o2 = self.off(ini), self.off(fim)
        out = []
        for i in range(o1, o2 - 3):
            v = struct.unpack_from('<I', self.data, i)[0]
            if self.cini <= v < self.cfim:
                s = self.literal(v)
                if s is not None:
                    out.append((self.va(i), s))
        return out

    def chamadas(self, ini, fim):
        o1, o2 = self.off(ini), self.off(fim)
        alvos = []
        for i in range(o1, o2 - 4):
            if self.data[i] == 0xE8:
                rel = struct.unpack_from('<i', self.data, i + 1)[0]
                alvo = self.va(i) + 5 + rel
                if self.cini <= alvo < self.cfim:
                    alvos.append(alvo)
        return alvos
