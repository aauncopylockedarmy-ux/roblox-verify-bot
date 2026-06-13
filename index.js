require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TIMERS_FILE = './timers.json';
const CODES_FILE = './codes.json';

// ─── Blockierte Wörter ────────────────────────────────────────────────────────
const BLOCKED_WORDS = [
  'owner', 'admin', 'administrator', 'moderator', 'mod', 'staff',
  'manager', 'developer', 'dev', 'bot', 'founder', 'co-owner',
  'discord', 'everyone', 'here', 'nitro', 'booster',
  'idiot', 'stupid', 'nazi', 'hate', 'kill', 'idiot',
  'beleidigung', 'hurensohn', 'scheiß', 'fick', 'fuck', 'shit', 'bitch'
];

function isNameBlocked(name) {
  const lower = name.toLowerCase();
  return BLOCKED_WORDS.some(word => lower.includes(word));
}

// ─── Farben ───────────────────────────────────────────────────────────────────
const COLORS = {
  RED: 0xe74c3c,
  ORANGE: 0xe67e22,
  YELLOW: 0xf1c40f,
  GREEN: 0x2ecc71,
  BLUE: 0x3498db,
  PURPLE: 0x9b59b6,
  PINK: 0xff69b4,
  WHITE: 0xffffff,
  BLACK: 0x23272a,
  CYAN: 0x1abc9c,
  BROWN: 0xa0522d,
  GOLD: 0xffd700
};

const COLOR_EMOJIS = {
  RED: '🔴', ORANGE: '🟠', YELLOW: '🟡', GREEN: '🟢',
  BLUE: '🔵', PURPLE: '🟣', PINK: '🩷', WHITE: '⚪',
  BLACK: '⚫', CYAN: '🩵', BROWN: '🟤', GOLD: '✨'
};

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function isAdmin(userId) {
  return process.env.ADMIN_IDS.split(',').map(id => id.trim()).includes(userId);
}

function loadTimers() {
  if (!fs.existsSync(TIMERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TIMERS_FILE, 'utf8'));
}
function saveTimers(timers) {
  fs.writeFileSync(TIMERS_FILE, JSON.stringify(timers, null, 2));
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

function parseDuration(str) {
  const match = str.match(/^(\d+)(m|h|d|w)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * multipliers[unit];
}

function formatDuration(ms) {
  const s = ms / 1000;
  if (s < 3600) return `${Math.round(s / 60)} minute(s)`;
  if (s < 86400) return `${Math.round(s / 3600)} hour(s)`;
  if (s < 604800) return `${Math.round(s / 86400)} day(s)`;
  return `${Math.round(s / 604800)} week(s)`;
}

function formatTimeLeft(expiresAt) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'Expired';
  return formatDuration(ms);
}

async function sendRoleDM(user, role, type, expiresAt = null) {
  try {
    if (type === 'timed') {
      await user.send({
        embeds: [new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('🎁 Role Granted!')
          .setDescription(`An administrator has granted you the 💎 **${role.name}** role for **${formatDuration(expiresAt - Date.now())}**!`)
          .addFields({ name: '📅 Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true })
          .setFooter({ text: 'Enjoy! 🎉' })
          .setTimestamp()]
      });
    } else {
      await user.send({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('🎁 Role Granted!')
          .setDescription(`An administrator has granted you the 💎 **${role.name}** role **permanently**!`)
          .setFooter({ text: 'Enjoy! 🎉' })
          .setTimestamp()]
      });
    }
  } catch {
    console.log(`[DM] Could not send DM to ${user.tag}`);
  }
}

// ─── Timer System ─────────────────────────────────────────────────────────────
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
      try {
        await member.user.send({
          embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('⏰ Role Expired').setDescription(`Your **${role.name}** role has expired.`).setTimestamp()]
        });
      } catch {}
    }
    saveTimers(loadTimers().filter(t => !(t.userId === userId && t.roleId === roleId && t.guildId === guildId)));
  } catch (err) {
    console.error('[TIMER ERROR]', err);
  }
}

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Role Bot is online as: ${client.user.tag}`);
  client.user.setActivity('/redeem', { type: 2 });
  const timers = loadTimers();
  for (const timer of timers) scheduleRoleRemoval(timer.guildId, timer.userId, timer.roleId, timer.expiresAt);
  console.log(`🔁 Restored ${timers.length} active timer(s)`);
});

// ─── Commands ─────────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  // Admin check (außer redeem)
  if (cmd !== 'redeem' && cmd !== 'timeroles' && !isAdmin(interaction.user.id)) {
    return await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ No Permission').setDescription('Only admins can use this command.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // ── /generatecode ─────────────────────────────────────────────────────────
  if (cmd === 'generatecode') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const uses = interaction.options.getInteger('uses');
    const targetUser = interaction.options.getUser('user');
    const code = generateCode();
    const codes = loadCodes();

    codes[code] = {
      uses,
      usesLeft: uses,
      guildId: interaction.guild.id,
      createdAt: new Date().toISOString(),
      redeemedBy: []
    };
    saveCodes(codes);

    // Code per DM an den ausgewählten User schicken
    try {
      await targetUser.send({
        embeds: [new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('🎟️ You received a Custom Role Code!')
          .setDescription(`An admin has sent you a code to create your own custom role!`)
          .addFields(
            { name: '🔑 Code', value: `\`\`\`${code}\`\`\``, inline: false },
            { name: '🔄 Uses', value: `${uses}x`, inline: true },
            { name: '📋 How to use', value: '`/redeem CODE YourRoleName Color`', inline: false }
          )
          .setFooter({ text: 'Use this code in the server to create your role!' })
          .setTimestamp()]
      });

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('✅ Code Sent!')
          .setDescription(`The code has been sent to **${targetUser.tag}** via DM! 📬`)
          .addFields(
            { name: 'User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Max Uses', value: `${uses}x`, inline: true }
          )]
      });
    } catch {
      // Falls DMs geschlossen
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('⚠️ Could not send DM')
          .setDescription(`**${targetUser.tag}** has DMs closed. Here is the code:`)
          .addFields(
            { name: '🔑 Code', value: `\`${code}\``, inline: false },
            { name: '🔄 Max Uses', value: `${uses}x`, inline: true }
          )]
      });
    }

    console.log(`[GENERATECODE] Code ${code} created (${uses} uses) → sent to ${targetUser.tag}`);
  }

  // ── /redeem ───────────────────────────────────────────────────────────────
  if (cmd === 'redeem') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const code = interaction.options.getString('code').toUpperCase().trim();
    const roleName = interaction.options.getString('rolename').trim();
    const colorKey = interaction.options.getString('color');
    const member = interaction.member;
    const codes = loadCodes();

    // Code prüfen
    if (!codes[code]) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Invalid Code').setDescription('This code does not exist.')]
      });
    }

    if (codes[code].usesLeft <= 0) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Code Expired').setDescription('This code has reached its maximum uses.')]
      });
    }

    // Gleicher User kann nur einmal einlösen
    if (codes[code].redeemedBy.includes(member.user.id)) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Already Redeemed').setDescription('You have already redeemed this code.')]
      });
    }

    // Rollennamen prüfen
    if (roleName.length < 2 || roleName.length > 30) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Invalid Role Name').setDescription('Role name must be between 2 and 30 characters.')]
      });
    }

    if (isNameBlocked(roleName)) {
      return await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Role Name Not Allowed')
          .setDescription(`The name **${roleName}** is not allowed.\n\nWords like \`owner\`, \`admin\`, \`mod\`, \`staff\` and offensive words are blocked.`)]
      });
    }

    // Rolle erstellen
    const color = COLORS[colorKey];
    const emoji = COLOR_EMOJIS[colorKey];

    const newRole = await interaction.guild.roles.create({
      name: roleName,
      color: color,
      reason: `Custom role created by ${member.user.tag} via code redemption`
    });

    await member.roles.add(newRole);

    // Code updaten
    codes[code].usesLeft--;
    codes[code].redeemedBy.push(member.user.id);
    saveCodes(codes);

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(color)
        .setTitle('✅ Role Created & Assigned!')
        .setDescription(`Your custom role has been created and assigned to you!`)
        .addFields(
          { name: '🏷️ Role Name', value: roleName, inline: true },
          { name: `${emoji} Color`, value: colorKey.charAt(0) + colorKey.slice(1).toLowerCase(), inline: true },
          { name: '🔄 Uses Left', value: `${codes[code].usesLeft}/${codes[code].uses}`, inline: true }
        )
        .setTimestamp()]
    });

    console.log(`[REDEEM] ${member.user.tag} created role "${roleName}" (${colorKey})`);
  }

  // ── /giveroletime ─────────────────────────────────────────────────────────
  if (cmd === 'giveroletime') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration');
    const durationMs = parseDuration(durationStr);

    if (!durationMs) return await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Invalid Duration').setDescription('Valid: `10m`, `1h`, `2d`, `1w`')] });

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ User Not Found')] });

    await member.roles.add(role);
    const expiresAt = Date.now() + durationMs;
    const timers = loadTimers().filter(t => !(t.userId === targetUser.id && t.roleId === role.id && t.guildId === interaction.guild.id));
    timers.push({ guildId: interaction.guild.id, userId: targetUser.id, roleId: role.id, username: targetUser.tag, roleName: role.name, expiresAt });
    saveTimers(timers);
    scheduleRoleRemoval(interaction.guild.id, targetUser.id, role.id, expiresAt);
    await sendRoleDM(targetUser, role, 'timed', expiresAt);

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle('⏱️ Timed Role Given')
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Role', value: `<@&${role.id}>`, inline: true },
          { name: 'Duration', value: formatDuration(durationMs), inline: true },
          { name: 'Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true }
        ).setTimestamp()]
    });
  }

  // ── /givepermrole ─────────────────────────────────────────────────────────
  if (cmd === 'givepermrole') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ User Not Found')] });
    if (member.roles.cache.has(role.id)) return await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('ℹ️ Already Has Role').setDescription(`<@${targetUser.id}> already has **${role.name}**.`)] });

    await member.roles.add(role);
    await sendRoleDM(targetUser, role, 'perm');

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Permanent Role Given')
        .addFields({ name: 'User', value: `<@${targetUser.id}>`, inline: true }, { name: 'Role', value: `<@&${role.id}>`, inline: true })
        .setTimestamp()]
    });
  }

  // ── /removerole ───────────────────────────────────────────────────────────
  if (cmd === 'removerole') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ User Not Found')] });
    if (!member.roles.cache.has(role.id)) return await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('ℹ️ Does Not Have Role')] });

    await member.roles.remove(role);
    saveTimers(loadTimers().filter(t => !(t.userId === targetUser.id && t.roleId === role.id && t.guildId === interaction.guild.id)));

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🗑️ Role Removed')
        .addFields({ name: 'User', value: `<@${targetUser.id}>`, inline: true }, { name: 'Role', value: `<@&${role.id}>`, inline: true })
        .setTimestamp()]
    });
  }

  // ── /timeroles ────────────────────────────────────────────────────────────
  if (cmd === 'timeroles') {
    const timers = loadTimers();
    if (timers.length === 0) return await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('⏱️ Active Timed Roles').setDescription('No active timed roles.')], flags: MessageFlags.Ephemeral });
    const list = timers.map(t => `<@${t.userId}> → <@&${t.roleId}> — expires **${formatTimeLeft(t.expiresAt)}**`).join('\n');
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle(`⏱️ Active Timed Roles (${timers.length})`).setDescription(list).setTimestamp()], flags: MessageFlags.Ephemeral });
  }
});

client.login(process.env.DISCORD_TOKEN);
