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
        .setName('quotes-controversial-leaderboard')
        .setDescription('See most controversial quotes'),

    async execute(interaction, db) {
        const PAGE_SIZE = 5;

        const getTotalQuotes = () => {
            const r = db.prepare('SELECT COUNT(*) AS total FROM quotes').get();
            return r ? r.total : 0;
        };

        const fetchPage = (page) => {
            const offset = page * PAGE_SIZE;
            const stmt = db.prepare(`
        SELECT
            q.id,
            q.text,
            q.author,
            COUNT(v.id) AS votes,
            COALESCE(AVG(v.vote_value), 0) AS avg_score,
            COALESCE(
                SQRT(
                AVG(v.vote_value * v.vote_value) -
                AVG(v.vote_value) * AVG(v.vote_value)
                ),
                0
            ) AS stddev
        FROM quotes q
        LEFT JOIN votes v ON q.id = v.quote_id
        GROUP BY q.id
        HAVING votes > 1
        ORDER BY stddev DESC, votes DESC
        LIMIT ? OFFSET ?
      `);
            return stmt.all(PAGE_SIZE, offset);
        };

        const buildEmbed = (rows, page, totalPages) => {
            const embed = new EmbedBuilder()
                .setTitle('Controversial Quotes Leaderboard')
                .setColor('#0099ff')
                .setFooter({
                    text: `Requested by ${interaction.user.tag} • Page ${page + 1}/${totalPages}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            rows.forEach((r, i) => {
                const clipped = r.text && r.text.length > 350 ? r.text.slice(0, 347) + '...' : (r.text || '');
                const author = r.author || 'Unknown';
                const stddev = Number(r.stddev || 0).toFixed(2);
                embed.addFields(
                    { name: `${i + 1 + page * PAGE_SIZE}. Quote by ${author}`, value: `“${clipped}”`, inline: true },
                    { name: 'Standard Deviation', value: `${stddev}`, inline: true },
                    { name: 'Votes', value: `${r.votes}`, inline: true }
                );
            });

            return embed;
        };

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
                        .setTitle('Controversial Quotes Leaderboard')
                        .setDescription('There are no quotes yet!')
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
    }
};
