const {Intents} = require("discord.js");

const Events = new Map()
  .set("channelCreate", "GUILDS")
  .set("channelDelete", "GUILDS")
  .set("channelPinsUpdate", "GUILDS")
  .set("channelUpdate", "GUILDS")
  //.set("debug", null)
  .set("emojiCreate", "GUILD_EMOJIS")
  .set("emojiDelete", "GUILD_EMOJIS")
  .set("emojiUpdate", "GUILD_EMOJIS")
  //.set("error", null)
  .set("guildBanAdd", "GUILD_BANS")
  .set("guildBanRemove", "GUILD_BANS")
  .set("guildCreate", "GUILDS")
  .set("guildDelete", "GUILDS")
  .set("guildIntegrationsUpdate", "GUILD_INTEGRATIONS")
  .set("guildMemberAdd", "GUILD_MEMBERS")
  .set("guildMemberRemove", "GUILD_MEMBERS")
  .set("guildMembersChunk", "GUILD_MEMBERS")
  .set("guildMemberSpeaking", "GUILD_VOICE_STATES")
  .set("guildMemberUpdate", "GUILD_MEMBERS")
  .set("guildUnavailable", "GUILDS")
  .set("guildUpdate", "GUILDS")
  //.set("invalidated", null)
  .set("inviteCreate", "GUILD_INVITES")
  .set("inviteDelete", "GUILD_INVITES")
  .set("message", "GUILD_MESSAGES")
  .set("messageDelete", "GUILD_MESSAGES")
  .set("messageDeleteBulk", "GUILD_MESSAGES")
  .set("messageReactionAdd", "GUILD_MESSAGE_REACTIONS")
  .set("messageReactionRemove", "GUILD_MESSAGE_REACTIONS")
  .set("messageReactionRemoveAll", "GUILD_MESSAGE_REACTIONS")
  .set("messageReactionRemoveEmoji", "GUILD_MESSAGE_REACTIONS")
  .set("messageUpdate", "GUILD_MESSAGES")
  .set("presenceUpdate", "GUILD_PRESENCES")
  //.set("rateLimit", null)
  //.set("ready", null)
  .set("roleCreate", "GUILDS")
  .set("roleDelete", "GUILDS")
  .set("roleUpdate", "GUILDS")
  //.set("shardDisconnect", null)
  //.set("shardError", null)
  //.set("shardReady", null)
  //.set("shardReconnecting", null)
  //.set("shardResume", null)
  .set("typingStart", "GUILD_MESSAGE_TYPING")
  .set("userUpdate", "GUILD_PRESENCES")
  .set("voiceStateUpdate", "GUILD_VOICE_STATES")
  //.set("warn", null)
  .set("webhookUpdate", "GUILD_WEBHOOKS");

function calcIntent(clientEvents, dms = true) {
  const intents = new Intents();

  for (const clientEvent of clientEvents) {
    if (Events.has(clientEvent)) {
      intents.add(Events.get(clientEvent));
    }
  }

  if (dms) {
    if (intents.has("GUILD_MESSAGES")) intents.add("DIRECT_MESSAGES");
    if (intents.has("GUILD_MESSAGE_REACTIONS")) intents.add("DIRECT_MESSAGE_REACTIONS");
    if (intents.has("GUILD_MESSAGE_TYPING")) intents.add("DIRECT_MESSAGE_TYPING");
  }

  return intents
}

module.exports = calcIntent;
