// Bot token ve client id bilgileri - şifrelenmiş
const SIFRELI_TOKEN = 'NUN2OUl4OkV3NUlzPEdaNUZ2PR.HuYVjz.nQUL4I8mSewPnhXLviSlFiZ-mS_ZwIqQ7SYuml';
const SIFRELEME_ANAHTARI = 1;
const CLIENT_ID = '1365986571928731669';
const GUILD_ID = '1364220759332880474';

// Sezar şifreleme/deşifreleme fonksiyonları
function sezarSifrele(metin, kaydirma) {
    let sonuc = '';
    for (let i = 0; i < metin.length; i++) {
        let karakter = metin[i];
        
        // Büyük harf ise
        if (karakter.match(/[A-Z]/)) {
            sonuc += String.fromCharCode((karakter.charCodeAt(0) - 65 + kaydirma) % 26 + 65);
        }
        // Küçük harf ise
        else if (karakter.match(/[a-z]/)) {
            sonuc += String.fromCharCode((karakter.charCodeAt(0) - 97 + kaydirma) % 26 + 97);
        }
        // Sayı veya özel karakter ise olduğu gibi bırak
        else {
            sonuc += karakter;
        }
    }
    return sonuc;
}

function sezarDesifrele(sifreliMetin, kaydirma) {
    // Negatif kaydırma kullanarak deşifrele
    return sezarSifrele(sifreliMetin, 26 - (kaydirma % 26));
}

// Token'ı deşifrele
const TOKEN = sezarDesifrele(SIFRELI_TOKEN, SIFRELEME_ANAHTARI);

module.exports = {
    TOKEN,
    CLIENT_ID,
    GUILD_ID,
    sezarSifrele,
    sezarDesifrele
}; 