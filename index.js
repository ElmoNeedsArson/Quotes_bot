require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, REST, Routes, Collection, EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
const addQuoteCmd = require('./commands/addquote.js');
const leaderboardCmd = require('./commands/leaderboard.js');
const myRankingCmd = require('./commands/myranking.js');
const quoteByName = require('./commands/quotes-by-name.js');

// A table for the raw quotes, who said the quote, who added it and when
// A table for ranking per user on a quote 
// A third table linking a discord message id to a quote id, so we know what quote to update
// A fourth table for remembering the daily quotes, to avoid repetition
const db = new Database('quotes.db');
db.exec(`
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  author TEXT,
  submitter TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER,
  user_id TEXT,
  vote_value INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(quote_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_quote_map (
  message_id TEXT PRIMARY KEY,
  quote_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_quotes (
  date TEXT PRIMARY KEY,
  quote_id INTEGER
);
`);

const voteOptions = [
    { icon: '1️⃣', value: 1 },
    { icon: '2️⃣', value: 2 },
    { icon: '3️⃣', value: 3 },
    { icon: '4️⃣', value: 4 },
    { icon: '5️⃣', value: 5 },
];

//commands uit externe js files halen
client.commands = new Collection();
client.commands.set(addQuoteCmd.data.name, addQuoteCmd);
client.commands.set(leaderboardCmd.data.name, leaderboardCmd);
client.commands.set(myRankingCmd.data.name, myRankingCmd);
client.commands.set(quoteByName.data.name, quoteByName);

const commandsJSON = [
    addQuoteCmd.data.toJSON(),
    leaderboardCmd.data.toJSON(),
    myRankingCmd.data.toJSON(),
    quoteByName.data.toJSON(),
];

//Upon load
client.once('ready', async () => {

    //Commands registration for bot
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commandsJSON }
        );
        console.log(`Registered ${commandsJSON.length} slash commands.`);
    } catch (err) {
        console.error('Command registration failed:', err);
    }

    console.log(`Logged in as ${client.user.tag}`);

    // daily quote cron scheduling
    cron.schedule(
        // '14 16 * * *', //minutes, hours (24 hour clock)
        '0 7 * * *',
        async () => { await random_daily_quote() },
        { timezone: 'Europe/Amsterdam' }
    );

    cron.schedule(
        // '14 16 * * *', //minutes, hours (24 hour clock)
        '0 19 * * *',
        async () => { await random_daily_quote() },
        { timezone: 'Europe/Amsterdam' }
    );

    async function random_daily_quote() {
        const channel = await client.channels.fetch(
            process.env.QUOTE_CHANNEL_ID
        );
        if (!channel) return;

        // Get all used quote_ids
        const usedQuotes = db.prepare(
            `SELECT quote_id FROM daily_quotes`
        ).all().map(row => row.quote_id);

        console.log(usedQuotes)

        // const quote = db
        //     .prepare('SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1')
        //     .get();

        // Try to get a random unused quote
        let quote;
        if (usedQuotes.length > 0) {
            quote = db.prepare(
                `SELECT * FROM quotes WHERE id NOT IN (${usedQuotes.map(() => '?').join(',')}) ORDER BY RANDOM() LIMIT 1`
            ).get(...usedQuotes);
        } else {
            quote = db.prepare('SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1').get();
        }

        // If all quotes have been used, reset and pick any quote
        if (!quote) {
            db.prepare('DELETE FROM daily_quotes').run();
            quote = db.prepare('SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1').get();
        }

        const embed = new EmbedBuilder()
            .setTitle('Quote of the day - Cast your vote')
            .setDescription(
                quote ? `“${quote.text}”` : 'No quotes have been added yet'
            )
            .setFooter({ text: `- ${quote?.author ?? 'Unknown'}` })
            .setColor(quote ? '#0099ff' : 'Red');

        const sent = await channel.send({ embeds: [embed] });
        for (const opt of voteOptions) await sent.react(opt.icon);

        if (quote) {
            db.prepare(
                'INSERT INTO message_quote_map (message_id, quote_id) VALUES (?, ?)'
            ).run(sent.id, quote.id);

            // Log the quote as used today
            db.prepare(
                'INSERT OR REPLACE INTO daily_quotes (date, quote_id) VALUES (datetime(\'now\'), ?)'
            ).run(quote.id);
        }
    }

    // Dev/test: send a quote 5 seconds after startup
    // setTimeout(async () => {
    //     const channel = await client.channels.fetch(
    //         process.env.QUOTE_CHANNEL_ID
    //     );
    //     if (!channel) return;

    //     const quote = db
    //         .prepare('SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1')
    //         .get();

    //     const embed = new EmbedBuilder()
    //         .setTitle('Testquote')
    //         .setDescription(
    //             quote ? `“${quote.text}”` : 'No quotes yet'
    //         )
    //         .setFooter({ text: quote ? `– ${quote.author ?? 'Unknown'}` : '' })
    //         .setColor('#00aa00');

    //     const sent = await channel.send({ embeds: [embed] });
    //     for (const opt of voteOptions) await sent.react(opt.icon);
    //     if (quote) {
    //         db.prepare(
    //             'INSERT INTO message_quote_map (message_id, quote_id) VALUES (?, ?)'
    //         ).run(sent.id, quote.id);
    //     }
    // }, 5000);
});

// more commands shit
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, db);
    } catch (err) {
        console.error(err);
        await interaction.reply({
            content: 'Smth went wrong',
            ephemeral: true,
        });
    }
});

// voor emoji reactions
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return; //ignore bots (otherwise looping n shi)
    if (reaction.partial) await reaction.fetch();
    const msg = reaction.message.partial ? await reaction.message.fetch() : reaction.message;

    //for the reactions on the message only care about the valid ones, otherwise return
    const opt = voteOptions.find(o => o.icon === reaction.emoji.name);
    if (!opt) return;

    //find the quote based on the message id in the third table
    const map = db
        .prepare(
            'SELECT quote_id FROM message_quote_map WHERE message_id = ?'
        )
        .get(msg.id);
    if (!map) return;

    // Remove other reactions - making sure you can only have one ranking
    for (const o of voteOptions) {
        if (o.icon !== reaction.emoji.name) {
            await msg.reactions.resolve(o.icon)
                ?.users.remove(user.id)
                .catch(() => { });
        }
    }

    // Insert, and otherwise update quote ranking for user
    db.prepare(
        `INSERT INTO votes (quote_id, user_id, vote_value)
        VALUES (?, ?, ?)
        ON CONFLICT(quote_id, user_id)
        DO UPDATE SET vote_value=excluded.vote_value, timestamp=CURRENT_TIMESTAMP`
    ).run(map.quote_id, user.id, opt.value);
});

client.login(process.env.DISCORD_TOKEN);