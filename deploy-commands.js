require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account and receive the role')
    .addStringOption(option =>
      option.setName('username').setDescription('Your Roblox username').setRequired(true)
    ).toJSON(),

  new SlashCommandBuilder()
    .setName('generatevipcode')
    .setDescription('Generate VIP codes (Admin only)')
    .addIntegerOption(option =>
      option.setName('amount').setDescription('How many codes to generate (max 10)').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('duration').setDescription('e.g. 30s, 10m, 1h, 2d, 1w, or "permanent"').setRequired(false)
    ).toJSON(),

  new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem a VIP code to receive the role')
    .addStringOption(option =>
      option.setName('code').setDescription('Your VIP code').setRequired(true)
    ).toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    // Erst Global Commands löschen
    console.log('Clearing global commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    console.log('✅ Global commands cleared!');

    // Dann Guild Commands registrieren (erscheint sofort!)
    console.log('Registering guild commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Done! Commands are now visible for everyone immediately!');
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
