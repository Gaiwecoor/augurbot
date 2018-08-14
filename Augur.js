const fs = require("fs"),
  Discord = require("discord.js"),
  Collection = Discord.Collection,
  path = require("path");

/**********************
**  COMMAND HANDLER  **
**********************/

const Handler = function(config, options = {}) {
  this.aliases = new Collection();
  this.bot = new Discord.Client(options.bot);
  this.clockwork = new Collection();
  this.commandCount = 0;
  this.commands = new Collection();
  this.config = config;
  this.db = ((this.config.db && this.config.db.model) ? require(path.resolve(process.cwd(), this.config.db.model)) : null);
  this.events = new Collection();
  this.options = options;
  this.unloadFn = new Collection();

  return this;
};

Handler.prototype.errorHandler = function(error, msg = null) {
  if (this.options.errorHandler) return this.options.errorHandler(error, msg);
  else {
    console.error(Date());
    if (msg) console.error(`${msg.author.username} in ${(msg.guild ? (msg.guild.name + " > " + msg.channel.name) : "DM")}: ${msg.cleanContent}`);
    console.error(error);
  }
};

Handler.prototype.execute = function(command, msg, suffix) {
  try {
    if (this.commands.has(command)) {
      this.commandCount++;
      this.commands.get(command).execute(msg, suffix);
    } else if (this.aliases.has(command)) {
      this.commandCount++;
      this.aliases.get(command).execute(msg, suffix);
    }
  } catch(e) {
    this.errorHandler(e, msg);
  }
};

Handler.prototype.parse = function(msg) {
  if (this.options.parse) return this.options.parse(msg);
  else {
    let message = msg.cleanContent;
    let prefix = this.config.prefix;
    if (!msg.author.bot && message.startsWith(prefix)) {
      let parse = message.slice(prefix.length).trim().split(" ");
      let command = parse.shift().toLowerCase();
      return {
        command: command,
        suffix: parse.join(" ")
      };
    } else return null;
  }
};

Handler.prototype.register = function(file = null, data = null) {
  if (file) {
    try {
      file = path.resolve(file);
      let load = require(file);

      load.config = this.config;
      load.db = this.db;
      load.handler = this;

      // REGISTER COMMANDS & ALIASES
      if (load.commands) {
        load.commands.forEach(command => {

          command.file = file;

          if (!this.commands.has(command.name))
          this.commands.set(command.name, command);

          if (command.aliases.length > 0) {
            command.aliases.filter(a => !this.aliases.has(a)).forEach(alias => {
              this.aliases.set(alias, command);
            });
          }
        });
      }

      // REGISTER EVENT HANDLERS
      if (load.events && (load.events.size > 0)) {
        load.events.forEach((handler, event) => {
          if (!this.events.has(event)) this.events.set(event, [{file: file, handler: handler}]);
          else this.events.get(event).push({file: file, handler: handler});
        });
      }

      // RUN INIT()
      if (load.init) load.init(data);

      // REGISTER CLOCKWORK
      if (load.clockwork) this.clockwork.set(file, load.clockwork());

      // REGISTER UNLOAD FUNCTION
      if (load.unload) this.unloadFn.set(file, load.unload);

    } catch(e) {
      this.errorHandler(e);
    }
  }

  return this;
};

Handler.prototype.reload = function(file = null) {
  if (file) {
    file = path.resolve(file);
    let unloadData = null;

    try {
      unloadData = this.unload(file);
      this.register(file, unloadData);
    }
    catch(e) {
      this.errorHandler(e);
    }
  }

  return this;
};

Handler.prototype.start = function() {
  return new Promise((fulfill, reject) => {
    let bot = this.bot;

    bot.on("ready", () => {
      console.log(bot.user.username + (bot.shard ? ` Shard ${bot.shard.id}` : "") + " is ready!");
      console.log(`Listening to ${bot.channels.size} channels in ${bot.guilds.size} servers.`);

      fulfill(this);
    });

    bot.on("message", (msg) => {
      let halt = false;
      if (this.events.has("message") && (this.events.get("message").length > 0)) {
        this.events.get("message").forEach(handler => {
          if (!halt) halt = handler.handler(msg);
        });
      }
      let parse = this.parse(msg);
      if (parse && !halt) this.execute(parse.command, msg, parse.suffix);
    });

    bot.on("messageUpdate", (oldMsg, msg) => {
      let halt = false;
      if (this.events.has("messageUpdate") && (this.events.get("messageUpdate").length > 0)) {
        this.events.get("messageUpdate").forEach(handler => {
          if (!halt) halt = handler.handler(oldMsg, msg);
        });
      }
      let parse = this.parse(msg);
      if (parse && !halt) this.execute(parse.command, msg, parse.suffix);
    });

    this.config.events.forEach(event => {
      bot.on(event, (...args) => {
        if (this.events.has(event) && (this.events.get(event).length > 0)) {
          let halt = false;
          this.events.get(event).forEach(handler => {
            if (!halt) halt = handler.handler(...args);
          });
        }
      });
    });

    bot.login(this.config.token).catch(reject);
  });
};

Handler.prototype.unload = function(file = null) {
  if (file) {
    file = path.resolve(file);
    try {
      // Clear Clockwork
      if (this.clockwork.has(file)) {
        clearInterval(this.clockwork.get(file));
        this.clockwork.delete(file);
      }

      // Clear Event Handlers
      this.events.forEach((handlers, event) => {
        this.events.set(event, handlers.filter(h => h.file != file));
      });

      // Unload
      let unloadData = null;
      if (this.unloadFn.has(file)) {
        unloadData = this.unloadFn.get(file)();
        this.unloadFn.delete(file);
      }

      // Clear Commands and Aliases
      this.commands = this.commands.filter(c => c.file != file);
      this.aliases = this.aliases.filter(c => c.file != file);

      // Clear cache and reload
      delete require.cache[require.resolve(file)];

      return unloadData;
    }
    catch(e) {
      this.errorHandler(e);
    }
  }

  return this;
};

/***********************
**  MODULE CONTAINER  **
***********************/

const Module = function() {
  this.commands = [];
  this.events = new Collection();
  this.clockwork = null;
  this.unload = null;
  this.config = {};

  return this;
};

Module.prototype.addCommand = function(info) {
  this.commands.push(new Command(info));
  return this;
};

Module.prototype.setClockwork = function(clockworkFunction) {
  this.clockwork = clockworkFunction;
  return this;
};

Module.prototype.addEvent = function(name, handler) {
  this.events.set(name, handler);
  return this;
};

Module.prototype.setUnload = function(unload) {
  this.unload = unload;
  return this;
};

Module.prototype.setInit = function(init) {
  this.init = init;
  return this;
};

/********************
**  COMMAND CLASS  **
********************/

const Command = function(info) {
  if (!info.name || !info.process) {
    throw("Commands must have the name and process properties.");
  }

  this.name = info.name;
  this.aliases = (info.aliases ? info.aliases : []);
  this.syntax = (info.syntax ? info.syntax : "");
  this.description = (info.description ? info.description : this.name + " " + this.syntax).trim();
  this.info = (info.info ? info.info : this.description);
  this.hidden = (info.hidden ? info.hidden : false);
  this.category = (info.category ? info.category : "General");
  this.permissions = (info.permissions ? info.permissions : () => true);
  this.process = info.process;

  this.file = null;

  return this;
};

Command.prototype.execute = function(msg, suffix) {
  if (this.permissions(msg)) this.process(msg, suffix);
};

/************************
**  SUPPORT FUNCTIONS  **
************************/

module.exports = {
  Module: Module,
  Handler: Handler
};
