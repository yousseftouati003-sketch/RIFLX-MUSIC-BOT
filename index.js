import 'dotenv/config';
import path from 'node:path';

import { Client, GatewayIntentBits } from 'discord.js';
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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client);

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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'test') {
      return interaction.reply('RIFLX MUSIC BOT fonctionne !');
    }

    if (interaction.commandName === 'play') {
      const voiceChannel = interaction.member.voice?.channel;

      if (!voiceChannel) {
        return interaction.reply({
          content: 'Entre dans un salon vocal avant de lancer une musique.',
          ephemeral: true
        });
      }

      const song = interaction.options.getString('song', true);

      await interaction.deferReply();

      console.log('YouTube search:', song);

      const result = await player.play(voiceChannel, song, {
        nodeOptions: {
          metadata: {
            channel: interaction.channel,
            requestedBy: interaction.user
          },
          leaveOnEmpty: true,
          leaveOnEnd: false,
          leaveOnStop: true,
          selfDeaf: true
        }
      });

      const trackTitle = result?.track?.title || song;

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

client.on('error', error => {
  console.error('DISCORD CLIENT ERROR:', error);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('LOGIN ERROR:', error);
});
