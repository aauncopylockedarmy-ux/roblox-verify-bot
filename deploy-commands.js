require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('giveroletime')
    .setDescription('Give a user a role for a limited time (Admin only)')
    .addUserOption(o => o.setName('user').setDescription('The user').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('The role to give').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 10m, 1h, 2d, 1w').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('givepermrole')
    .setDescription('Give a user a permanent role (Admin only)')
    .addUserOption(o => o.setName('user').setDescription('The user').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('The role to give').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('removerole')
    .setDescription('Remove a role from a user (Admin only)')
    .addUserOption(o => o.setName('user').setDescription('The user').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('The role to remove').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('timeroles')
    .setDescription('Show all active timed roles (Admin only)')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('generatecode')
    .setDescription('Generate a custom role code (Admin only)')
    .addIntegerOption(o => o.setName('uses').setDescription('How many times can this code be redeemed?').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('The user to send the code to via DM').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem a code to create your own custom role!')
    .addStringOption(o => o.setName('code').setDescription('Your code').setRequired(true))
    .addStringOption(o => o.setName('rolename').setDescription('Name for your new role').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Color for your role').setRequired(true)
      .addChoices(
        { name: '🔴 Red', value: 'RED' },
        { name: '🟠 Orange', value: 'ORANGE' },
        { name: '🟡 Yellow', value: 'YELLOW' },
        { name: '🟢 Green', value: 'GREEN' },
        { name: '🔵 Blue', value: 'BLUE' },
        { name: '🟣 Purple', value: 'PURPLE' },
        { name: '🩷 Pink', value: 'PINK' },
        { name: '⚪ White', value: 'WHITE' },
        { name: '⚫ Black', value: 'BLACK' },
        { name: '🩵 Cyan', value: 'CYAN' },
        { name: '🟤 Brown', value: 'BROWN' },
        { name: '✨ Gold', value: 'GOLD' }
      ))
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering global commands...');
    // Global statt Guild Commands
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Global Commands registered! (can take up to 1 hour to appear for everyone)');
  } catch (err) {
    console.error(err);
  }
})();
