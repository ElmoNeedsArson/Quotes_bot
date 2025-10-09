const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
        const input = interaction.options.getString('authors').toLowerCase();
        const names = input.split(/\s*,\s*/).filter(n => n);

        if (names.length === 0) {
            return interaction.reply({
                content: 'You must specify at least one author or alias.',
                ephemeral: true
            });
        }

        const whereClauses = names.map(() => 'LOWER(author) LIKE ?').join(' OR ');
        const params = names.map(n => `%${n}%`);

        const stmt = db.prepare(
            `SELECT id, text, author, submitter, timestamp
            FROM quotes
            WHERE ${whereClauses}
            ORDER BY timestamp DESC`
            //LIMIT 24`
        );
        const rows = stmt.all(...params);

        if (rows.length === 0) {
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

        // Build the response embed
        const embed = new EmbedBuilder()
            .setTitle('Quotes by Name')
            .setDescription(`Found ${rows.length} quote${rows.length === 1 ? '' : 's'} matching: ${names.map(n => `"${n}"`).join(', ')}`)
            .setColor('#0099ff')
            .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        // List up to 5 quotes
        rows.slice(0, 24).forEach(q => {
            const clipped = q.text.length > 100 ? q.text.slice(0, 97) + '...' : q.text;
            embed.addFields({ name: `#${q.id} • ${q.author}`, value: `> “${clipped}”`, inline: false });
        });

        if (rows.length > 24) {
            embed.addFields({ name: 'And more...', value: `Showing 24 of ${rows.length} results. Refine your search or check the database directly.` });
        }

        await interaction.reply({ embeds: [embed] });
    }
};
