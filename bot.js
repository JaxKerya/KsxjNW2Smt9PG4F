const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { TOKEN, CLIENT_ID, GUILD_ID } = require('./config');

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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

// Veritabanı dosya yolu
const DB_PATH = path.join(__dirname, 'veritabani.json');

// Veritabanı nesnesi
let db = {
    alınacakRol: null,
    verilecekRol: null,
    hoşGeldinKanalı: null
};

// Hoş geldin mesajı önbelleği
const hosgeldinCache = new Map();

// Log fonksiyonu
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    if (data) {
        console.log('Detaylar:', JSON.stringify(data, null, 2));
    }
}

// Veritabanını yükle
function veritabanıYükle() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            db = JSON.parse(data);
            console.log('Veritabanı başarıyla yüklendi.');
        } else {
            // Veritabanı dosyası yoksa oluştur
            veritabanıKaydet();
            console.log('Yeni veritabanı dosyası oluşturuldu.');
        }
    } catch (error) {
        console.error('Veritabanı yüklenirken hata:', error);
    }
}

// Veritabanını kaydet
function veritabanıKaydet() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
        console.log('Veritabanı başarıyla kaydedildi.');
    } catch (error) {
        console.error('Veritabanı kaydedilirken hata:', error);
    }
}

// Komutları ayarla
const commands = [
    new SlashCommandBuilder()
        .setName('kayıt')
        .setDescription('Bir kullanıcıyı kayıt eder.')
        .addUserOption(option =>
            option.setName('kullanıcı')
                  .setDescription('Kayıt edilecek kullanıcıyı seçin')
                  .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('kayıt-ayarla')
        .setDescription('Kayıt için alınacak ve verilecek rolleri ayarlar.')
        .addRoleOption(option =>
            option.setName('alınacak_rol')
                  .setDescription('Kullanıcıdan alınacak rolü seçin')
                  .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('verilecek_rol')
                  .setDescription('Kullanıcıya verilecek rolü seçin')
                  .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('hoşgeldin-kanal-ayarla')
        .setDescription('Hoş geldin mesajlarının gönderileceği kanalı ayarlar.')
        .addChannelOption(option =>
            option.setName('kanal')
                  .setDescription('Hoş geldin mesajlarının gönderileceği kanalı seçin')
                  .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('ayarlar')
        .setDescription('Mevcut bot ayarlarını gösterir.'),
    new SlashCommandBuilder()
        .setName('test')
        .setDescription('Hoş geldin mesajını test etmek için kullanılır.')
        .addUserOption(option =>
            option.setName('kullanıcı')
                  .setDescription('Test için kullanılacak kullanıcıyı seçin')
                  .setRequired(true)
        ),
];

// Komutları Discord'a yükle
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Slash komutlar yükleniyor...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('Slash komutlar başarıyla yüklendi.');
    } catch (error) {
        console.error(error);
    }
})();

// Gelişmiş hata yönetimi için yardımcı fonksiyon
function hataYonet(interaction, error, islemTipi, member = null) {
    const hataDetay = {
        islem: islemTipi,
        kullanici: member ? member.user.tag : 'Bilinmiyor',
        sunucu: interaction.guild.name,
        hata: error.message,
        stack: error.stack,
        zaman: new Date().toISOString()
    };

    // Hata detaylarını logla
    log('ERROR', `${islemTipi} işlemi sırasında hata oluştu`, hataDetay);

    // Hata embedini oluştur
    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Hata')
        .setDescription(`İşlem sırasında bir hata oluştu: ${error.message}`)
        .addFields(
            {
                name: '🔍 Hata Detayı',
                value: `\`\`\`${error.message}\`\`\``,
                inline: false
            },
            {
                name: '⏰ Zaman',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            }
        )
        .setFooter({
            text: interaction.guild.name,
            iconURL: interaction.guild.iconURL({ dynamic: true })
        })
        .setTimestamp();

    // Hata mesajını gönder
    return interaction.update({ 
        embeds: [errorEmbed], 
        components: [] 
    });
}

// Kullanıcı kaydetme fonksiyonu
async function kullanıcıKaydet(member, interaction = null) {
    try {
        // Veritabanından rol bilgilerini al
        const alınacakRolId = db.alınacakRol;
        const verilecekRolId = db.verilecekRol;
        
        // Bot izinlerini kontrol et
        const botMember = member.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw new Error('Bot, rolleri yönetme iznine sahip değil!');
        }
        
        // Rol işlemleri
        let rolDegistiMesaji = '';
        
        if (alınacakRolId) {
            const alınacakRol = member.guild.roles.cache.get(alınacakRolId);
            
            if (alınacakRol) {
                // Botun rol hiyerarşisini kontrol et
                if (botMember.roles.highest.position <= alınacakRol.position) {
                    throw new Error(`Botun rolü, alınacak rolden (${alınacakRol.name}) daha düşük pozisyonda!`);
                }
                
                // Kullanıcının alınacak role sahip olup olmadığını kontrol et
                if (member.roles.cache.has(alınacakRolId)) {
                    await member.roles.remove(alınacakRolId);
                }
            } else {
                throw new Error(`Alınacak rol (ID: ${alınacakRolId}) bulunamadı!`);
            }
        }
        
        if (verilecekRolId) {
            const verilecekRol = member.guild.roles.cache.get(verilecekRolId);
            
            if (verilecekRol) {
                // Botun rol hiyerarşisini kontrol et
                if (botMember.roles.highest.position <= verilecekRol.position) {
                    throw new Error(`Botun rolü, verilecek rolden (${verilecekRol.name}) daha düşük pozisyonda!`);
                }
                
                // Kullanıcının verilecek role zaten sahip olup olmadığını kontrol et
                if (!member.roles.cache.has(verilecekRolId)) {
                    await member.roles.add(verilecekRolId);
                    rolDegistiMesaji += `• ${verilecekRol.name} rolü verildi.\n`;
                }
            } else {
                throw new Error(`Verilecek rol (ID: ${verilecekRolId}) bulunamadı!`);
            }
        }
        
        if (interaction) {
            const updatedEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Kayıt Tamamlandı')
                .setDescription(`${member} kullanıcısı başarıyla kayıt edildi.`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '👤 Kullanıcı',
                        value: member.user.tag,
                        inline: true
                    },
                    {
                        name: '👮‍♂️ İşlemi Yapan',
                        value: interaction.user.tag,
                        inline: true
                    }
                )
                .setFooter({
                    text: member.guild.name,
                    iconURL: member.guild.iconURL({ dynamic: true })
                })
                .setTimestamp();
            
            if (rolDegistiMesaji.length > 0) {
                updatedEmbed.addFields({ 
                    name: '🔄 Rol Değişiklikleri', 
                    value: rolDegistiMesaji,
                    inline: false 
                });
            }
                
            return interaction.update({ 
                embeds: [updatedEmbed], 
                components: []
            });
        }
        
        return true;
    } catch (error) {
        if (interaction) {
            return hataYonet(interaction, error, 'Kayıt', member);
        }
        throw error;
    }
}

// Bot olayları
client.on('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı.`);
    // Bot başlatıldığında veritabanını yükle
    veritabanıYükle();
    
    // Botun iznini kontrol et
    client.guilds.cache.forEach(guild => {
        console.log(`Sunucu: ${guild.name}`);
        const botMember = guild.members.me;
        if (botMember) {
            if (botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                console.log('✅ Bot, rolleri yönetme iznine sahip.');
            } else {
                console.log('❌ UYARI: Bot, rolleri yönetme iznine sahip değil!');
            }
            
            // Botun rol hiyerarşisini kontrol et
            if (db.alınacakRol || db.verilecekRol) {
                const alınacakRol = db.alınacakRol ? guild.roles.cache.get(db.alınacakRol) : null;
                const verilecekRol = db.verilecekRol ? guild.roles.cache.get(db.verilecekRol) : null;
                const botRol = botMember.roles.highest;
                
                if (alınacakRol && botRol.position <= alınacakRol.position) {
                    console.log(`❌ UYARI: Botun rolü (${botRol.name}), alınacak rolden (${alınacakRol.name}) daha düşük pozisyonda!`);
                }
                
                if (verilecekRol && botRol.position <= verilecekRol.position) {
                    console.log(`❌ UYARI: Botun rolü (${botRol.name}), verilecek rolden (${verilecekRol.name}) daha düşük pozisyonda!`);
                }
            }
        }
    });
});

// Yeni kullanıcı sunucuya katıldığında çalışacak olay
client.on(Events.GuildMemberAdd, async (member) => {
    log('INFO', `Yeni kullanıcı katıldı: ${member.user.tag} (${member.id})`, {
        guild: member.guild.name,
        guildId: member.guild.id
    });
    
    // Önbellek kontrolü
    const cacheKey = `${member.guild.id}_${member.id}`;
    const lastMessageTime = hosgeldinCache.get(cacheKey);
    const now = Date.now();
    
    if (lastMessageTime) {
        const timeDiff = (now - lastMessageTime) / 1000; // saniye cinsinden
        log('DEBUG', `Önbellek kontrolü: ${member.user.tag} için son mesaj ${timeDiff.toFixed(2)} saniye önce gönderilmiş`);
    }
    
    // Eğer son mesaj 5 dakika içinde gönderilmişse, yeni mesaj gönderme
    if (lastMessageTime && (now - lastMessageTime) < 5 * 1000) {
        log('INFO', `${member.user.tag} için son mesaj çok yakın zamanda gönderildi. Yeni mesaj gönderilmeyecek.`);
        return;
    }
    
    // Veritabanından ayarları kontrol et
    if (!db.hoşGeldinKanalı || !db.alınacakRol || !db.verilecekRol) {
        log('WARN', 'Hoş geldin ayarları tamamlanmamış', {
            hosgeldinKanalı: db.hoşGeldinKanalı,
            alınacakRol: db.alınacakRol,
            verilecekRol: db.verilecekRol
        });
        return;
    }
    
    const kanal = member.guild.channels.cache.get(db.hoşGeldinKanalı);
    if (!kanal) {
        log('ERROR', `Hoş geldin kanalı bulunamadı`, {
            kanalId: db.hoşGeldinKanalı,
            mevcutKanallar: member.guild.channels.cache.map(c => ({ id: c.id, name: c.name }))
        });
        return;
    }
    
    log('INFO', `Hoş geldin mesajı hazırlanıyor`, {
        kullanıcı: member.user.tag,
        kanal: kanal.name,
        kanalId: kanal.id
    });
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Yeni kullanıcı katıldı!')
        .setDescription(`${member} kullanıcısı sunucuya katıldı, ne yapmak istersiniz?`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            {
                name: '📅 Hesap Oluşturma',
                value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
                inline: true
            },
            {
                name: '📅 Katılım',
                value: `<t:${Math.floor(Date.now() / 1000)}:D>`,
                inline: true
            }
        )
        .setFooter({
            text: member.guild.name,
            iconURL: member.guild.iconURL({ dynamic: true })
        })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`kaydet_${member.id}`)
                .setLabel('Kaydet')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`at_${member.id}`)
                .setLabel('At')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`banla_${member.id}`)
                .setLabel('Banla')
                .setStyle(ButtonStyle.Danger)
        );
    
    try {
        await kanal.send({ embeds: [embed], components: [row] });
        log('SUCCESS', `Hoş geldin mesajı gönderildi`, {
            kullanıcı: member.user.tag,
            kanal: kanal.name
        });
        // Önbelleğe ekle
        hosgeldinCache.set(cacheKey, now);
        log('DEBUG', `Önbellek güncellendi`, {
            cacheKey,
            timestamp: now
        });
    } catch (err) {
        log('ERROR', `Hoş geldin mesajı gönderilirken hata oluştu`, {
            error: err.message,
            stack: err.stack
        });
    }
});

client.on('interactionCreate', async interaction => {
    // Buton etkileşimlerini işle
    if (interaction.isButton()) {
        const [action, userId] = interaction.customId.split('_');
        
        if (action === 'kaydet') {
            if (!db.alınacakRol || !db.verilecekRol) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Hata')
                    .setDescription('Roller henüz ayarlanmamış!')
                    .setTimestamp();
                
                return interaction.update({ 
                    embeds: [errorEmbed], 
                    components: []
                });
            }
            
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            
            if (!member) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Hata')
                    .setDescription('Kullanıcı bulunamadı.')
                    .setTimestamp();
                
                return interaction.update({ 
                    embeds: [errorEmbed], 
                    components: []
                });
            }
            
            await kullanıcıKaydet(member, interaction);
        } 
        else if (action === 'at') {
            try {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                
                if (!member) {
                    throw new Error('Kullanıcı bulunamadı veya zaten sunucudan ayrılmış.');
                }
                
                // Bot izinlerini kontrol et
                const botMember = interaction.guild.members.me;
                if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
                    throw new Error('Bot, üyeleri atma iznine sahip değil!');
                }
                
                // Kullanıcıyı sunucudan at
                await member.kick(`${interaction.user.tag} tarafından atıldı.`);
                
                const kickEmbed = new EmbedBuilder()
                    .setColor(0xFF9900)
                    .setTitle('🚫 Kullanıcı Atıldı')
                    .setDescription(`${member.user.tag} kullanıcısı sunucudan atıldı.`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        {
                            name: '👤 Kullanıcı',
                            value: member.user.tag,
                            inline: true
                        },
                        {
                            name: '👮‍♂️ İşlemi Yapan',
                            value: interaction.user.tag,
                            inline: true
                        }
                    )
                    .setFooter({
                        text: member.guild.name,
                        iconURL: member.guild.iconURL({ dynamic: true })
                    })
                    .setTimestamp();
                
                await interaction.update({ 
                    embeds: [kickEmbed], 
                    components: []
                });
            } catch (error) {
                return hataYonet(interaction, error, 'Atma');
            }
        }
        else if (action === 'banla') {
            try {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                
                if (!member) {
                    throw new Error('Kullanıcı bulunamadı veya zaten sunucudan ayrılmış.');
                }
                
                // Bot izinlerini kontrol et
                const botMember = interaction.guild.members.me;
                if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
                    throw new Error('Bot, üyeleri banlama iznine sahip değil!');
                }
                
                // Kullanıcıyı sunucudan banla
                await member.ban({
                    reason: `${interaction.user.tag} tarafından banlandı.`,
                    deleteMessageSeconds: 60 * 60 * 24 // Son 24 saatteki mesajları sil
                });
                
                const banEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🔨 Kullanıcı Banlandı')
                    .setDescription(`${member.user.tag} kullanıcısı sunucudan banlandı.`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        {
                            name: '👤 Kullanıcı',
                            value: member.user.tag,
                            inline: true
                        },
                        {
                            name: '👮‍♂️ İşlemi Yapan',
                            value: interaction.user.tag,
                            inline: true
                        },
                        {
                            name: '🗑️ Silinen Mesajlar',
                            value: 'Son 24 saatteki mesajlar silindi',
                            inline: false
                        }
                    )
                    .setFooter({
                        text: member.guild.name,
                        iconURL: member.guild.iconURL({ dynamic: true })
                    })
                    .setTimestamp();
                
                await interaction.update({ 
                    embeds: [banEmbed], 
                    components: []
                });
            } catch (error) {
                return hataYonet(interaction, error, 'Ban');
            }
        }
        
        return;
    }

    // Slash komut etkileşimlerini işle
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'kayıt') {
        if (!db.alınacakRol || !db.verilecekRol) {
            return interaction.reply({ content: 'Önce `/kayıt-ayarla` komutuyla roller ayarlanmalı!', ephemeral: true });
        }

        const hedef = interaction.options.getUser('kullanıcı');
        const member = await interaction.guild.members.fetch(hedef.id).catch(() => null);

        if (!member) {
            return interaction.reply({ content: 'Belirtilen kullanıcı bulunamadı.', ephemeral: true });
        }

        try {
            await kullanıcıKaydet(member);
            await interaction.reply({ content: `${member} başarıyla kayıt edildi! 🎉`, ephemeral: false });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Rol değiştirirken bir hata oluştu.', ephemeral: true });
        }
    }
    else if (interaction.commandName === 'kayıt-ayarla') {
        try {
            const alınacakRol = interaction.options.getRole('alınacak_rol');
            const verilecekRol = interaction.options.getRole('verilecek_rol');
            
            // Veritabanında rolleri güncelle
            db.alınacakRol = alınacakRol.id;
            db.verilecekRol = verilecekRol.id;
            veritabanıKaydet();
            
            await interaction.reply({ 
                content: `Roller ayarlandı!\nAlınacak rol: ${alınacakRol}\nVerilecek rol: ${verilecekRol}`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Rol ayarlama hatası:', error);
            // Eğer etkileşim henüz yanıtlanmadıysa yanıtla
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'Roller ayarlanırken bir hata oluştu.', 
                    ephemeral: true 
                });
            }
        }
    }
    else if (interaction.commandName === 'hoşgeldin-kanal-ayarla') {
        try {
            const kanal = interaction.options.getChannel('kanal');
            
            // Veritabanında kanalı güncelle
            db.hoşGeldinKanalı = kanal.id;
            veritabanıKaydet();
            
            await interaction.reply({ 
                content: `Hoş geldin kanalı ${kanal} olarak ayarlandı!`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Kanal ayarlama hatası:', error);
            // Eğer etkileşim henüz yanıtlanmadıysa yanıtla
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'Hoş geldin kanalı ayarlanırken bir hata oluştu.', 
                    ephemeral: true 
                });
            }
        }
    }
    else if (interaction.commandName === 'ayarlar') {
        try {
            let mesaj = '**Mevcut Bot Ayarları**\n\n';
            
            if (db.alınacakRol) {
                const rol = interaction.guild.roles.cache.get(db.alınacakRol);
                mesaj += `**Alınacak Rol:** ${rol ? rol.name : 'Bulunamadı'} (ID: ${db.alınacakRol})\n`;
            } else {
                mesaj += '**Alınacak Rol:** Ayarlanmamış\n';
            }
            
            if (db.verilecekRol) {
                const rol = interaction.guild.roles.cache.get(db.verilecekRol);
                mesaj += `**Verilecek Rol:** ${rol ? rol.name : 'Bulunamadı'} (ID: ${db.verilecekRol})\n`;
            } else {
                mesaj += '**Verilecek Rol:** Ayarlanmamış\n';
            }
            
            if (db.hoşGeldinKanalı) {
                const kanal = interaction.guild.channels.cache.get(db.hoşGeldinKanalı);
                mesaj += `**Hoş Geldin Kanalı:** ${kanal ? kanal.name : 'Bulunamadı'} (ID: ${db.hoşGeldinKanalı})\n`;
            } else {
                mesaj += '**Hoş Geldin Kanalı:** Ayarlanmamış\n';
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Bot Ayarları')
                .setDescription(mesaj)
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Ayarlar gösterilirken hata:', error);
            await interaction.reply({ 
                content: 'Ayarlar gösterilirken bir hata oluştu.', 
                ephemeral: true 
            });
        }
    }
    else if (interaction.commandName === 'test') {
        try {
            const testUser = interaction.options.getUser('kullanıcı');
            const member = await interaction.guild.members.fetch(testUser.id).catch(() => null);

            if (!member) {
                return interaction.reply({ 
                    content: 'Belirtilen kullanıcı bulunamadı.', 
                    ephemeral: true 
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('Yeni kullanıcı katıldı!')
                .setDescription(`${member} kullanıcısı sunucuya katıldı, ne yapmak istersiniz?`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '📅 Hesap Oluşturma',
                        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
                        inline: true
                    },
                    {
                        name: '📅 Katılım',
                        value: `<t:${Math.floor(Date.now() / 1000)}:D>`,
                        inline: true
                    }
                )
                .setFooter({
                    text: member.guild.name,
                    iconURL: member.guild.iconURL({ dynamic: true })
                })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`kaydet_${member.id}`)
                        .setLabel('Kaydet')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`at_${member.id}`)
                        .setLabel('At')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`banla_${member.id}`)
                        .setLabel('Banla')
                        .setStyle(ButtonStyle.Danger)
                );

            await interaction.reply({ 
                content: 'Test mesajı:',
                embeds: [embed], 
                components: [row],
                ephemeral: true 
            });

        } catch (error) {
            console.error('Test komutu hatası:', error);
            await interaction.reply({ 
                content: 'Test mesajı oluşturulurken bir hata oluştu.', 
                ephemeral: true 
            });
        }
    }
});

// Botu başlat
client.login(TOKEN);