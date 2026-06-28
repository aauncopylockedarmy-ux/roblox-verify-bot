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

// ─── Duration Parsing ─────────────────────────────────────────────────────────
function parseDuration(str) {
  if (!str || str.toLowerCase() === 'permanent' || str.toLowerCase() === 'forever') {
    return null; // null = permanent
  }
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return undefined; // undefined = invalid
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * multipliers[unit];
}

function formatDuration(ms) {
  if (ms === null) return 'Permanent';
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)} second(s)`;
  if (s < 3600) return `${Math.round(s / 60)} minute(s)`;
  if (s < 86400) return `${Math.round(s / 3600)} hour(s)`;
  if (s < 604800) return `${Math.round(s / 86400)} day(s)`;
  return `${Math.round(s / 604800)} week(s)`;
}

// ─── VIP Timer System ─────────────────────────────────────────────────────────
const TIMERS_FILE = './vip_timers.json';

function loadTimers() {
  if (!fs.existsSync(TIMERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TIMERS_FILE, 'utf8'));
}
function saveTimers(timers) {
  fs.writeFileSync(TIMERS_FILE, JSON.stringify(timers, null, 2));
}

function scheduleRoleRemoval(guildId, userId, roleId, expiresAt) {
  const delay = expiresAt - Date.now();
  if (delay <= 0) { removeRoleNow(guildId, userId, roleId); return; }
  setTimeout(() => removeRoleNow(guildId, userId, roleId), delay);
}

async function removeRoleNow(guildId, userId, roleId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    const role = guild.roles.cache.get(roleId);
    if (!role) return;

    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(role);
      console.log(`[VIP TIMER] Removed role ${role.name} from ${member.user.tag}`);
      try {
        await member.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⏰ VIP Expired')
            .setDescription(`Your **${role.name}** role has expired and been removed.`)
            .setTimestamp()]
        });
      } catch {}
    }

    saveTimers(loadTimers().filter(t => !(t.userId === userId && t.roleId === roleId && t.guildId === guildId)));
  } catch (err) {
    console.error('[VIP TIMER ERROR]', err);
  }
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

  const timers = loadTimers();
  for (const timer of timers) {
    scheduleRoleRemoval(timer.guildId, timer.userId, timer.roleId, timer.expiresAt);
  }
  console.log(`🔁 Restored ${timers.length} active VIP timer(s)`);
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
    const durationStr = interaction.options.getString('duration');

    const durationMs = parseDuration(durationStr);
    if (durationMs === undefined) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Invalid Duration')
          .setDescription('Valid formats:\n`30s` = 30 seconds\n`10m` = 10 minutes\n`1h` = 1 hour\n`2d` = 2 days\n`1w` = 1 week\n`permanent` = forever')]
      });
    }

    const codes = loadCodes();
    const newCodes = [];

    for (let i = 0; i < Math.min(amount, 10); i++) {
      const code = generateCode();
      codes[code] = { used: false, createdAt: new Date().toISOString(), durationMs };
      newCodes.push(code);
    }

    saveCodes(codes);

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`🎟️ Generated ${newCodes.length} VIP Code${newCodes.length > 1 ? 's' : ''}`)
        .setDescription(newCodes.map(c => `\`${c}\``).join('\n'))
        .addFields({ name: 'Duration', value: formatDuration(durationMs), inline: true })
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

    const durationMs = codes[code].durationMs;
    let expiresAt = null;

    if (durationMs) {
      expiresAt = Date.now() + durationMs;
      const timers = loadTimers();
      timers.push({
        guildId: interaction.guild.id,
        userId: member.user.id,
        roleId: role.id,
        username: member.user.tag,
        roleName: role.name,
        expiresAt
      });
      saveTimers(timers);
      scheduleRoleRemoval(interaction.guild.id, member.user.id, role.id, expiresAt);
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ Code Redeemed!')
      .setDescription(`You have successfully redeemed the code and received the **${role.name}** role!`)
      .addFields({ name: 'Duration', value: durationMs ? formatDuration(durationMs) : 'Permanent', inline: true })
      .setTimestamp();

    if (expiresAt) {
      embed.addFields({ name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });

    console.log(`[REDEEM] ${member.user.tag} redeemed code ${code} (duration: ${durationMs ? formatDuration(durationMs) : 'Permanent'})`);
  }
});

client.login(process.env.DISCORD_TOKEN);
