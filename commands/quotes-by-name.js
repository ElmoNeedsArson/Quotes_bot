const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quotes-by-name')
        .setDescription('Find quotes by one or more author names (comma-separated).')
        .addStringOption(opt =>
            opt
                .setName('authors')
                .setDescription('Comma-separated list of author names to search for, e.g. "daniel,bananiel"')
                .setRequired(true)
        ),

    async execute(interaction, db) {
        const PAGE_SIZE = 10;

        const input = interaction.options.getString('authors').toLowerCase();
        const names = input.split(/\s*,\s*/).filter(n => n);

        // sql query to find quotes by any of the specified names
        const whereClauses = names.map(() => 'LOWER(author) LIKE ?').join(' OR ');
        const params = names.map(n => `%${n}%`);

        const getTotalQuotes = () => {
            const stmt = db.prepare(`
                SELECT id, text, author, submitter, timestamp
                FROM quotes
                WHERE ${whereClauses}
                ORDER BY timestamp DESC
            `);
            const rows = stmt.all(...params);
            return rows ? rows.length : 0;
        };

        if (names.length === 0) {
            return interaction.reply({
                content: 'You must specify at least one author or alias.',
                ephemeral: true
            });
        }

        const fetchPage = (page) => {
            const offset = page * PAGE_SIZE;
            const stmt = db.prepare(
                `SELECT id, text, author, submitter, timestamp
                FROM quotes
                WHERE ${whereClauses}
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?`
            );
            return stmt.all(...params, PAGE_SIZE, offset);
        };

        // const stmt = db.prepare(
        //     `SELECT id, text, author, submitter, timestamp
        //     FROM quotes
        //     WHERE ${whereClauses}
        //     ORDER BY timestamp DESC`
        //     //LIMIT 24`
        // );
        // const rows = stmt.all(...params);

        // if (rows.length === 0) {
        //     return interaction.reply({
        //         embeds: [
        //             new EmbedBuilder()
        //                 .setTitle('Quotes by Name')
        //                 .setDescription(`No quotes found for: ${names.map(n => `"${n}"`).join(', ')}`)
        //                 .setColor('Red')
        //         ],
        //         ephemeral: true
        //     });
        // }

        const buildEmbed = (rows, page, totalPages) => {
            // Build the response embed
            const embed = new EmbedBuilder()
                .setTitle('Quotes by Name')
                .setDescription(`Found ${rows.length} quote${rows.length === 1 ? '' : 's'} matching: ${names.map(n => `"${n}"`).join(', ')}`)
                .setColor('#0099ff')
                .setFooter({
                    text: `Requested by ${interaction.user.tag} • Page ${page + 1}/${totalPages}`,
                    iconURL: interaction.user.displayAvatarURL()
                });
            // List up to 5 quotes
            rows.slice(0, PAGE_SIZE).forEach(q => {
                const clipped = q.text.length > 150 ? q.text.slice(0, 147) + '...' : q.text;
                embed.addFields({ name: `#${q.id} • ${q.author}`, value: `> “${clipped}”`, inline: false });
            });

            // if (rows.length > PAGE_SIZE) {
            //     embed.addFields({ name: 'And more...', value: `Showing ${PAGE_SIZE} of ${rows.length} results. Refine your search or check the database directly.` });
            // }
            return embed;
        }

        const buildButtons = (page, totalPages) => {
            const prevPage = page - 1;
            const nextPage = page + 1;

            const prev = new ButtonBuilder()
                .setCustomId(`quotes_nav_${prevPage}`)
                .setLabel('◀ Prev')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page <= 0);

            const next = new ButtonBuilder()
                .setCustomId(`quotes_nav_${nextPage}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages - 1);

            return new ActionRowBuilder().addComponents(prev, next);
        };

        const total = getTotalQuotes();
        if (!total) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Quotes by Name')
                        .setDescription(`No quotes found for: ${names.map(n => `"${n}"`).join(', ')}`)
                        .setColor('Red')
                ],
                ephemeral: true
            });
        }

        const totalPages = Math.ceil(total / PAGE_SIZE);
        let currentPage = 0;

        const rows = fetchPage(currentPage);
        const embed = buildEmbed(rows, currentPage, totalPages);
        const buttons = buildButtons(currentPage, totalPages);

        //const embed = buildEmbed(rows, 0, 1);

        const message = await interaction.reply({
            embeds: [embed],
            components: [buttons],
            fetchReply: true
        });

        const filter = (i) =>
            i.customId && i.customId.startsWith('quotes_nav_');

        const collector = message.createMessageComponentCollector({
            filter,
            componentType: ComponentType.Button,
            time: 300_000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            await i.deferUpdate();

            const parts = i.customId.split('_');
            const targetPage = parseInt(parts[2], 10);
            if (Number.isNaN(targetPage)) return;

            if (targetPage < 0 || targetPage >= totalPages) return;

            currentPage = targetPage;
            const newRows = fetchPage(currentPage);
            const newEmbed = buildEmbed(newRows, currentPage, totalPages);
            const newButtons = buildButtons(currentPage, totalPages);

            await message.edit({ embeds: [newEmbed], components: [newButtons] });
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('disabled_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('disabled_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(true)
            );

            try {
                await message.edit({ components: [disabledRow] });
            } catch (err) {
            }
        });


        //await interaction.reply({ embeds: [embed] });
    }
};
