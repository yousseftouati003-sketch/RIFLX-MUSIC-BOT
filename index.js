import 'dotenv/config';
import path from 'node:path';

import { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } from 'discord.js';
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

// --- Gojo Satoru theme -----------------------------------------------------
const THEME = {
  color: 0x8b5cf6, // Hollow Purple
  gifPlay: 'https://media.tenor.com/zZOt7alSzAMAAAAM/gojo-gojo-satoru.gif',
  gifSearch: 'https://media.tenor.com/8UntVSgyu6QAAAAM/gojo-satoru-satoru-gojo.gif',
  gifStop: 'https://media.tenor.com/hMd8cHEyjvgAAAAM/gojo.gif',
  gifExtra: 'https://media.tenor.com/uC2DREfKavIAAAAM/gojo-satoru.gif',
  footer: '✨ DEV BY RIFLX'
};

const baseEmbed = () => new EmbedBuilder().setColor(THEME.color).setTimestamp();

const embedNowPlaying = (track, user, diag = '') =>
  baseEmbed()
    .setTitle('🎵 Now Playing')
    .setDescription(`**${track}**${diag ? `\n\n\`\`\`diff\n${diag}\n\`\`\`` : ''}`)
    .setImage(THEME.gifPlay)
    .setAuthor({ name: `Demandé par ${user.tag || user.username || user}` })
    .setFooter({ text: THEME.footer });

const embedSearching = (query) =>
  baseEmbed()
    .setTitle('🔍 Recherche en cours...')
    .setDescription(`Recherche de **${query}** sur YouTube...`)
    .setImage(THEME.gifSearch)
    .setFooter({ text: THEME.footer });

const embedStopped = () =>
  baseEmbed()
    .setTitle('⏹ Lecture arrêtée')
    .setDescription('La musique a été stoppée. **Domain Expansion** activé. 🟣')
    .setImage(THEME.gifStop)
    .setFooter({ text: THEME.footer });

const embedError = (details) =>
  new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('❌ Erreur de lecture')
    .setDescription(String(details).slice(0, 1000))
    .setImage(THEME.gifExtra)
    .setFooter({ text: THEME.footer });

const embedUsage = () =>
  baseEmbed()
    .setTitle('⚠️ Commande incomplète')
    .setDescription(
      'Utilise: `/play song:<titre ou lien YouTube>`\n' +
      '💡 Alternative qui marche à coup sûr: `!!play <titre ou lien>`'
    )
    .setImage(THEME.gifExtra)
    .setFooter({ text: THEME.footer });

const embedNoVoice = () =>
  baseEmbed()
    .setTitle('🔊 Salon vocal requis')
    .setDescription('Entre dans un salon vocal avant de lancer une musique.')
    .setImage(THEME.gifExtra)
    .setFooter({ text: THEME.footer });

// --- client ----------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const player = new Player(client);

// --- voice/runtime diagnostics ---------------------------------------------
let opusEncoder = 'opusscript';
const lastErrors = [];
const pushError = (tag, e) => {
  const msg = String(e?.message || e).slice(0, 200);
  lastErrors.unshift(`${tag}: ${msg}`);
  if (lastErrors.length > 4) lastErrors.pop();
};

process.on('unhandledRejection', (e) => { console.error('UNHANDLED REJECTION:', e); pushError('unhandled', e); });
process.on('uncaughtException', (e) => { console.error('UNCAUGHT EXCEPTION:', e); pushError('uncaught', e); });

const VOICE_STATUS = ['Connecting', 'Waiting', 'Signalling', 'Ready', 'Destroyed'];

async function voiceDiag(queue, channel) {
  const perms = channel?.permissionsFor?.(client.user);
  const status = queue?.connection?.state?.status;
  const lines = [
    `Connexion: ${status === 3 ? '✅ Ready' : `⚠️ ${VOICE_STATUS[status] ?? 'unknown'}`}`,
    `Permissions: ${perms ? `${perms.has('Connect') ? '✅' : '❌'} Connect · ${perms.has('Speak') ? '✅' : '❌'} Speak` : 'n/a'}`,
    `Encoder: ${opusEncoder}`,
    `Canal: ${channel?.name ?? 'n/a'}${channel?.bitrate ? ` • ${Math.round(channel.bitrate / 1000)}kbps` : ''}`,
    `Erreurs: ${lastErrors.length ? lastErrors.join(' | ') : 'aucune'}`
  ];
  return lines.join('\n');
}

client.on('voiceStateUpdate', (oldState, newState) => {
  if (newState.id === client.user?.id) {
    console.log(
      `[VOICE] bot moved: ${oldState.channelId ?? 'spawn'} -> ${newState.channelId ?? 'disconnected'}`
    );
  }
});

// --- shared playback helper ------------------------------------------------
async function playSong(voiceChannel, song, textChannel, user) {
  const startTrack = (target) =>
    player.play(voiceChannel, target, {
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

  let result;
  let source = 'YouTube';

  try {
    result = await startTrack(song);
  } catch (error) {
    const msg = String(error?.message || error);
    if (!/extract stream|could not/i.test(msg)) throw error;

    // YouTube blocked the server IP -> automatic SoundCloud fallback.
    console.log('[FALLBACK] YouTube stream failed -> trying SoundCloud...');
    pushError('youtube-blocked', error);

    const search = await player.search(song, { searchEngine: 'soundCloudSearch' }).catch(() => null);
    if (!search || search.isEmpty()) throw error;

    result = await startTrack(search.tracks[0]);
    source = 'SoundCloud (YouTube bloqué)';
  }

  const queue = result?.queue;
  console.log(
    `[VOICE] connection status: ${queue?.connection?.state?.status ?? 'n/a'}` +
    ` | channel: ${queue?.channel?.name ?? 'n/a'}` +
    ` | playing: ${queue?.isPlaying() ?? 'n/a'}` +
    ` | source: ${source}`
  );

  // Let the stream settle, then snapshot the voice state for the embed.
  await new Promise((r) => setTimeout(r, 4000));
  const diag = `Source: ${source}\n` + (await voiceDiag(queue, queue?.channel ?? voiceChannel));

  return { title: result?.track?.title || song, diag };
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

  await message.reply({
    embeds: [
      baseEmbed()
        .setTitle('📋 DIAG')
        .setDescription(
          '```bf\n' +
          `- Bot app ID : ${app}\n` +
          `- Serveur    : ${message.guildId}\n` +
          `- Node       : ${process.version}\n` +
          `- Guild cmds : ${fmtCommands(guildCmds)}\n` +
          `- Global cmds: ${fmtCommands(globalCmds)}\n` +
          '```'
        )
        .setFooter({ text: THEME.footer })
    ]
  });
}

// --- startup ---------------------------------------------------------------
client.once('clientReady', async () => {
  console.log(`RIFLX MUSIC BOT online as ${client.user.tag}`);
  console.log('FFmpeg:', ffmpegPath);

  // Which Opus encoder is active (native = clearer audio)?
  import('@discordjs/opus')
    .then(() => { opusEncoder = 'native @discordjs/opus'; console.log('🎧 Opus encoder: native @discordjs/opus'); })
    .catch(() => { opusEncoder = 'opusscript (JS)'; console.log('🎧 Opus encoder: opusscript (JS fallback)'); });

  // Register built-in extractors (SoundCloud, Vimeo, ...) — used as fallback
  // when YouTube blocks the server's IP.
  try {
    await player.extractors.loadDefault();
    console.log('Default extractors registered (SoundCloud fallback ready).');
  } catch (error) {
    console.error('Default extractors error:', error.message || error);
  }

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
  pushError('playerError', error);
});

player.events.on('error', (queue, error) => {
  console.error('QUEUE ERROR:', error);
  pushError('queueError', error);
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
      return interaction.reply({ embeds: [baseEmbed().setTitle('✅ Fonctionne!').setImage(THEME.gifExtra).setFooter({ text: THEME.footer })] });
    }

    if (interaction.commandName === 'diag') {
      await interaction.reply({ content: '📋 Diag en cours...', ephemeral: true });
      return sendDiag(interaction);
    }

    if (interaction.commandName === 'play') {
      const voiceChannel = interaction.member.voice?.channel;

      if (!voiceChannel) {
        return interaction.reply({ embeds: [embedNoVoice()], ephemeral: true });
      }

      const song = interaction.options.getString('song');

      if (!song) {
        return interaction.reply({ embeds: [embedUsage()], ephemeral: true });
      }

      await interaction.deferReply();

      console.log('YouTube search:', song);
      await interaction.editReply({ embeds: [embedSearching(song)] });

      const { title: trackTitle, diag } = await playSong(voiceChannel, song, interaction.channel, interaction.user);

      await interaction.editReply({ embeds: [embedNowPlaying(trackTitle, interaction.user, diag)] });

      console.log('Playback request completed.');
      return;
    }

    if (interaction.commandName === 'stop') {
      const queue = player.nodes.get(interaction.guildId);

      if (!queue) {
        return interaction.reply({ embeds: [baseEmbed().setTitle('ℹ️ Aucune musique en cours').setFooter({ text: THEME.footer })], ephemeral: true });
      }

      await queue.delete();
      return interaction.reply({ embeds: [embedStopped()] });
    }
  } catch (error) {
    console.error('MUSIC ERROR:', error.stack || error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embedError(error.message || error)] }).catch(console.error);
    } else {
      await interaction.reply({ embeds: [embedError(error.message || error)], ephemeral: true }).catch(console.error);
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
        await message.reply({ embeds: [baseEmbed().setTitle('✅ Fonctionne!').setImage(THEME.gifExtra).setFooter({ text: THEME.footer })] });
        return;

      case 'diag':
        await sendDiag(message);
        return;

      case 'play': {
        if (!args) {
          await message.reply({ embeds: [embedUsage()] });
          return;
        }
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
          await message.reply({ embeds: [embedNoVoice()] });
          return;
        }
        const msg = await message.reply({ embeds: [embedSearching(args)] });
        console.log('YouTube search:', args);
        const { title: trackTitle, diag } = await playSong(voiceChannel, args, message.channel, message.author);
        await msg.edit({ embeds: [embedNowPlaying(trackTitle, message.author, diag)] });
        console.log('Playback request completed.');
        return;
      }

      case 'stop': {
        const queue = player.nodes.get(message.guildId);
        if (!queue) {
          await message.reply({ embeds: [baseEmbed().setTitle('ℹ️ Aucune musique en cours').setFooter({ text: THEME.footer })] });
          return;
        }
        await queue.delete();
        await message.reply({ embeds: [embedStopped()] });
        return;
      }

      default:
        return;
    }
  } catch (error) {
    console.error('MUSIC ERROR:', error.stack || error);
    await message.reply({ embeds: [embedError(error.message || error)] })
      .catch(console.error);
  }
});

client.on('error', error => {
  console.error('DISCORD CLIENT ERROR:', error);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('LOGIN ERROR:', error);
});
