// Slash-command definitions + registration (auto-run when the bot starts).
import 'dotenv/config';
import { pathToFileURL } from 'node:url';

import { REST, Routes } from 'discord.js';

// `default_member_permissions: null` = every member can use the command
// (no permission required — @everyone included).
const EVERYONE = null;

export const COMMANDS = [
  {
    name: 'test',
    description: 'Vérifie que le bot répond.',
    default_member_permissions: EVERYONE,
  },
  {
    name: 'diag',
    description: 'Affiche le diagnostic des commandes enregistrées.',
    default_member_permissions: EVERYONE,
  },
  {
    name: 'play',
    description: 'Joue une musique (YouTube) dans ton salon vocal.',
    default_member_permissions: EVERYONE,
    options: [
      {
        name: 'song',
        description: 'Titre ou lien de la musique.',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'stop',
    description: 'Arrête la musique en cours.',
    default_member_permissions: EVERYONE,
  },
];

/**
 * Registers the slash commands.
 * With a guildId they appear instantly; without it they are global (up to 1h delay).
 */
export async function registerCommands(clientId, token, guildId = '') {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = COMMANDS;
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body });

  // Read back what Discord actually saved — proves the options are there.
  const saved = await rest.get(route);
  const summary = saved
    .map((c) => `${c.name}(${(c.options || []).map((o) => o.name).join(',')})`)
    .join(', ');
  console.log(`✅ Registered ${saved.length} commands: ${summary}`);
}

// Allows `npm run deploy-commands` from the terminal.
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const token = (process.env.DISCORD_TOKEN || '').trim();
  const guildId = (process.env.GUILD_ID || '').trim();

  if (!token) {
    console.error('❌ DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  // The client id equals the application id; fetch it from the Discord API.
  fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${token}` },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Discord API responded with ${res.status}`);
      return res.json();
    })
    .then((me) => registerCommands(me.id, token, guildId))
    .catch((err) => {
      console.error('❌ Failed to register commands:', err.message || err);
      process.exit(1);
    });
}
