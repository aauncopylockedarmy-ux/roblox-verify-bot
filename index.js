require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ─── Datenbank ────────────────────────────────────────────────────────────────
const DB_FILE = './verified.json';
const CODES_FILE = './codes.json';

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { byDiscord: {}, byRoblox: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function loadCodes() {
  if (!fs.existsSync(CODES_FILE)) return {};
  return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8'));
}

function saveCodes(codes) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2));
}

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Roblox API ───────────────────────────────────────────────────────────────
async function getRobloxUserId(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;
  return data.data[0].id;
}

async function hasGamepass(robloxUserId, gamepassId) {
  const res = await fetch(
    `https://inventory.roblox.com/v1/users/${robloxUserId}/items/GamePass/${gamepassId}`
  );
  const data = await res.json();
  return data.data && data.data.length > 0;
}

// ─── Bot Events ───────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot is online as: ${client.user.tag}`);
  client.user.setActivity('/verify', { type: 2 });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ── /verify ──────────────────────────────────────────────────────────────
  if (interaction.commandName === 'verify') {
    await interaction.deferReply({ ephemeral: true });

    const robloxUsername = interaction.options.getString('username');
    const member = interaction.member;
    const discordId = member.user.id;

    try {
      const db = loadDB();

      // Roblox User ID holen
      const robloxUserId = await getRobloxUserId(robloxUsername);

      if (!robloxUserId) {
        return await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('❌ Roblox User Not Found')
            .setDescription(`The username **${robloxUsername}** does not exist on Roblox.`)
            .setFooter({ text: 'Please enter your exact Roblox username.' })]
        });
      }

      const robloxKey = String(robloxUserId);

      // Ist dieser Roblox Account schon von jemand anderem geclaimed?
      if (db.byRoblox[robloxKey] && db.byRoblox[robloxKey] !== discordId) {
        return await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('❌ Roblox Account Already Claimed')
            .setDescription(`The Roblox account **${robloxUsername}** has already been verified by someone else.\n\nPlease use a different Roblox account.`)]
        });
      }

      // Gamepass prüfen
      const ownsPass = await hasGamepass(robloxUserId, process.env.ROBLOX_GAMEPASS_ID);

      if (!ownsPass) {
        return await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle('⚠️ Gamepass Not Found')
            .setDescription(
              `**${robloxUsername}** does not own the required Gamepass.\n\n` +
              `Purchase the Gamepass and try again with \`/verify\`.`
            )
            .addFields({ name: 'Gamepass ID', value: `\`${process.env.ROBLOX_GAMEPASS_ID}\``, inline: true })]
        });
      }

      // Rolle holen
      const role = interaction.guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
      if (!role) {
        return await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('❌ Configuration Error')
            .setDescription('The role was not found. Please contact an admin.')]
        });
      }

      // Falls der Discord User vorher einen anderen Roblox Account hatte, den alten freigeben
      if (db.byDiscord[discordId]) {
        const oldRobloxId = String(db.byDiscord[discordId].robloxId);
        delete db.byRoblox[oldRobloxId];
      }

      // Rolle geben & speichern
      await member.roles.add(role);

      db.byDiscord[discordId] = { robloxUsername, robloxId: robloxUserId, verifiedAt: new Date().toISOString() };
      db.byRoblox[robloxKey] = discordId;
      saveDB(db);

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('✅ Successfully Verified!')
          .setDescription(`Welcome! You have been given the **${role.name}** role.\n\nRoblox Account: **${robloxUsername}**`)
          .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxUserId}&width=420&height=420&format=png`)
          .setTimestamp()]
      });

      console.log(`[VERIFY] ${member.user.tag} → Roblox: ${robloxUsername} (ID: ${robloxUserId})`);

    } catch (err) {
      console.error('[ERROR]', err);
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Error')
          .setDescription('An unexpected error occurred. Please try again later.')]
      });
    }
  }

  // ── /generatevipcode ──────────────────────────────────────────────────────
  if (interaction.commandName === 'generatevipcode') {
    // Nur du kannst das!
    if (!process.env.ADMIN_IDS.split(",").includes(interaction.user.id)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const amount = interaction.options.getInteger('amount') || 1;
    const codes = loadCodes();
    const newCodes = [];

    for (let i = 0; i < Math.min(amount, 10); i++) {
      const code = generateCode();
      codes[code] = { used: false, createdAt: new Date().toISOString() };
      newCodes.push(code);
    }

    saveCodes(codes);

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`🎟️ Generated ${newCodes.length} VIP Code${newCodes.length > 1 ? 's' : ''}`)
        .setDescription(newCodes.map(c => `\`${c}\``).join('\n'))
        .setFooter({ text: 'Share these codes with your users!' })
        .setTimestamp()]
    });
  }

  // ── /redeem ───────────────────────────────────────────────────────────────
  if (interaction.commandName === 'redeem') {
    await interaction.deferReply({ ephemeral: true });

    const code = interaction.options.getString('code').toUpperCase().trim();
    const member = interaction.member;
    const codes = loadCodes();

    if (!codes[code]) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Invalid Code')
          .setDescription('This code does not exist. Please check and try again.')]
      });
    }

    if (codes[code].used) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Code Already Used')
          .setDescription('This code has already been redeemed by someone else.')]
      });
    }

    const role = interaction.guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
    if (!role) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Configuration Error')
          .setDescription('The role was not found. Please contact an admin.')]
      });
    }

    if (member.roles.cache.has(role.id)) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('ℹ️ Already Have Role')
          .setDescription(`You already have the **${role.name}** role.`)]
      });
    }

    await member.roles.add(role);

    codes[code].used = true;
    codes[code].usedBy = member.user.tag;
    codes[code].usedAt = new Date().toISOString();
    saveCodes(codes);

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Code Redeemed!')
        .setDescription(`You have successfully redeemed the code and received the **${role.name}** role!`)
        .setTimestamp()]
    });

    console.log(`[REDEEM] ${member.user.tag} redeemed code ${code}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
