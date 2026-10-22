"""Leitor de DFM binário (TPF0) do Delphi."""
import struct


class Leitor:
    def __init__(self, b):
        self.b, self.p = b, 0

    def u8(self):
        v = self.b[self.p]; self.p += 1; return v

    def ss(self):
        n = self.u8(); s = self.b[self.p:self.p + n]; self.p += n
        return s.decode('cp1252', 'replace')

    def valor(self, t=None):
        if t is None:
            t = self.u8()
        b = self.b
        if t == 0: return None
        if t == 1:
            l = []
            while self.b[self.p] != 0:
                l.append(self.valor())
            self.p += 1
            return l
        if t == 2: v = struct.unpack_from('<b', b, self.p)[0]; self.p += 1; return v
        if t == 3: v = struct.unpack_from('<h', b, self.p)[0]; self.p += 2; return v
        if t == 4: v = struct.unpack_from('<i', b, self.p)[0]; self.p += 4; return v
        if t == 5: self.p += 10; return 0.0
        if t in (6, 7): return self.ss()
        if t == 8: return False
        if t == 9: return True
        if t == 10:
            n = struct.unpack_from('<i', b, self.p)[0]; self.p += 4 + n; return b'<bin>'
        if t == 11:
            l = []
            while True:
                s = self.ss()
                if not s: break
                l.append(s)
            return set(l)
        if t == 12:
            n = struct.unpack_from('<i', b, self.p)[0]; self.p += 4
            s = b[self.p:self.p + n].decode('cp1252', 'replace'); self.p += n; return s
        if t == 13: return None
        if t == 14:
            itens = []
            while self.b[self.p] != 0:
                if self.b[self.p] in (2, 3, 4):
                    self.valor()
                self.u8()  # vaList
                props = {}
                while self.b[self.p] != 0:
                    nome = self.ss(); props[nome] = self.valor()
                self.p += 1
                itens.append(props)
            self.p += 1
            return itens
        if t == 15: self.p += 4; return 0.0
        if t == 16 or t == 17 or t == 21: self.p += 8; return 0.0
        if t == 18:
            n = struct.unpack_from('<i', b, self.p)[0]; self.p += 4
            s = b[self.p:self.p + 2 * n].decode('utf-16-le', 'replace'); self.p += 2 * n; return s
        if t == 19: self.p += 8; return 0
        if t == 20:
            n = struct.unpack_from('<i', b, self.p)[0]; self.p += 4
            s = b[self.p:self.p + n].decode('utf-8', 'replace'); self.p += n; return s
        raise ValueError(f'tipo {t} em {self.p}')

    def componente(self):
        f = self.b[self.p]
        if f & 0xF0 == 0xF0:
            self.p += 1
            if f & 2:
                self.valor()
        classe = self.ss(); nome = self.ss()
        props = {}
        while self.b[self.p] != 0:
            k = self.ss(); props[k] = self.valor()
        self.p += 1
        filhos = []
        while self.b[self.p] != 0:
            filhos.append(self.componente())
        self.p += 1
        return {'classe': classe, 'nome': nome, 'props': props, 'filhos': filhos}


def ler(b):
    if b[:4] != b'TPF0':
        raise ValueError('não é DFM binário')
    L = Leitor(b); L.p = 4
    return L.componente()
