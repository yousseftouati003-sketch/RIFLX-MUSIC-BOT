import 'dotenv/config';
import path from 'node:path';

import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { Player } from 'discord-player';
import { YoutubeExtractor } from 'discord-player-youtubei';
import ffmpegPath from 'ffmpeg-static';

import { registerCommands } from './commands.js';

if (!process.env.DISCORD_TOKEN) {
  console.error('ERROR: DISCORD_TOKEN is missing from .env');
  process.exit(1);
}

if (!ffmpegPath) {
  console.error('ERROR: FFmpeg not found.');
  process.exit(1);
}

// Make FFmpeg available to child processes.
process.env.PATH =
  path.dirname(ffmpegPath) +
  path.delimiter +
  process.env.PATH;

const PREFIX = '!!';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const player = new Player(client);

// --- shared playback helper ------------------------------------------------
async function playSong(voiceChannel, song, textChannel, user) {
  const result = await player.play(voiceChannel, song, {
    nodeOptions: {
      metadata: {
        channel: textChannel,
        requestedBy: user
      },
      leaveOnEmpty: true,
      leaveOnEnd: false,
      leaveOnStop: true,
      selfDeaf: true
    }
  });
  return result?.track?.title || song;
}

// --- diagnostics -----------------------------------------------------------
function fmtCommands(list) {
  if (list === null) return '❌ erreur';
  if (!list.length) return '⚠️ EMPTY (aucune commande)';
  return list.map((c) => `${c.name}(${(c.options || []).map((o) => o.name).join(',')})`).join(', ');
}

async function sendDiag(message) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const app = client.application.id;

  const guildCmds = await rest
    .get(Routes.applicationGuildCommands(app, message.guildId))
    .catch(() => null);
  const globalCmds = await rest
    .get(Routes.applicationCommands(app))
    .catch(() => null);

  await message.reply(
    '📋 **DIAG**\n' +
    '```bf\n' +
    `- Bot app ID : ${app}\n` +
    `- Serveur    : ${message.guildId}\n` +
    `- Node       : ${process.version}\n` +
    `- Guild cmds : ${fmtCommands(guildCmds)}\n` +
    `- Global cmds: ${fmtCommands(globalCmds)}\n` +
    '```\n' +
    'Colle-moi cette réponse exactement telle quelle.'
  );
}

// --- startup ---------------------------------------------------------------
client.once('clientReady', async () => {
  console.log(`RIFLX MUSIC BOT online as ${client.user.tag}`);
  console.log('FFmpeg:', ffmpegPath);

  try {
    await player.extractors.register(YoutubeExtractor);
    console.log('YouTube extractor registered.');
  } catch (error) {
    console.error('YouTube extractor error:', error);
  }

  // Make sure the slash commands exist (instant if GUILD_ID is set).
  try {
    await registerCommands(client.user.id, process.env.DISCORD_TOKEN, process.env.GUILD_ID?.trim());
  } catch (error) {
    console.error('Command registration error:', error.message || error);
  }
});

// Show when playback really starts.
player.events.on('playerStart', (queue, track) => {
  console.log('NOW PLAYING:', track.title);
});

// Show track and playback errors.
player.events.on('playerError', (queue, error) => {
  console.error('PLAYER ERROR:', error);
});

player.events.on('error', (queue, error) => {
  console.error('QUEUE ERROR:', error);
});

// --- slash commands --------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Diagnostic: which app/command/options exactly did Discord send?
  console.log(
    `[CMD] name=${interaction.commandName}` +
    ` app=${interaction.applicationId}` +
    ` mine=${client.application?.id}` +
    ` guild=${interaction.guildId}` +
    ` options=${JSON.stringify(interaction.options.data)}`
  );

  try {
    if (interaction.commandName === 'test') {
      return interaction.reply('RIFLX MUSIC BOT fonctionne !');
    }

    if (interaction.commandName === 'diag') {
      await interaction.reply({ content: '📋 Diag en cours...', ephemeral: true });
      return sendDiag(interaction);
    }

    if (interaction.commandName === 'play') {
      const voiceChannel = interaction.member.voice?.channel;

      if (!voiceChannel) {
        return interaction.reply({
          content: 'Entre dans un salon vocal avant de lancer une musique.',
          ephemeral: true
        });
      }

      const song = interaction.options.getString('song');

      if (!song) {
        return interaction.reply({
          content: '⚠️ Utilise: `/play song:<titre ou lien YouTube>` — le champ "song" est obligatoire.\n💡 Alternative qui marche à coup sûr: `!!play <titre ou lien>`',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      console.log('YouTube search:', song);
      const trackTitle = await playSong(voiceChannel, song, interaction.channel, interaction.user);

      await interaction.editReply(
        `Demande envoyée : ${trackTitle}\n` +
        `Si la musique ne démarre pas, vérifie les logs du bot.`
      );

      console.log('Playback request completed.');
      return;
    }

    if (interaction.commandName === 'stop') {
      const queue = player.nodes.get(interaction.guildId);

      if (!queue) {
        return interaction.reply({
          content: 'Aucune musique en cours.',
          ephemeral: true
        });
      }

      await queue.delete();
      return interaction.reply('Lecture arrêtée.');
    }
  } catch (error) {
    console.error('MUSIC ERROR:', error.stack || error);

    const details = String(error.message || error).slice(0, 1000);
    const response = `Erreur de lecture : ${details}`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(response).catch(console.error);
    } else {
      await interaction.reply({
        content: response,
        ephemeral: true
      }).catch(console.error);
    }
  }
});

// --- text commands (!!play, !!stop, !!test, !!diag) ------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = (message.content || '').trim();
  if (!content.startsWith(PREFIX)) return;

  const [cmd, ...rest] = content.slice(PREFIX.length).trim().split(/\s+/);
  const args = rest.join(' ');

  try {
    switch (cmd.toLowerCase()) {
      case 'test':
        await message.reply('RIFLX MUSIC BOT fonctionne !');
        return;

      case 'diag':
        await sendDiag(message);
        return;

      case 'play': {
        if (!args) {
          await message.reply(`⚠️ Utilise: \`${PREFIX}play <titre ou lien YouTube>\``);
          return;
        }
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
          await message.reply('Entre dans un salon vocal avant de lancer une musique.');
          return;
        }
        const typing = await message.reply('🔍 Recherche en cours...');
        console.log('YouTube search:', args);
        const trackTitle = await playSong(voiceChannel, args, message.channel, message.author);
        await typing.edit(`🎵 Lecture: **${trackTitle}**`);
        console.log('Playback request completed.');
        return;
      }

      case 'stop': {
        const queue = player.nodes.get(message.guildId);
        if (!queue) {
          await message.reply('Aucune musique en cours.');
          return;
        }
        await queue.delete();
        await message.reply('Lecture arrêtée.');
        return;
      }

      default:
        return;
    }
  } catch (error) {
    console.error('MUSIC ERROR:', error.stack || error);
    await message.reply(`Erreur de lecture : ${String(error.message || error).slice(0, 500)}`)
      .catch(console.error);
  }
});

client.on('error', error => {
  console.error('DISCORD CLIENT ERROR:', error);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('LOGIN ERROR:', error);
});
