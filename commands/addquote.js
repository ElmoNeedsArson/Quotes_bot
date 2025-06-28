const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quotes-add')
        .setDescription('Add a quote')
        .addStringOption(opt =>
            opt
                .setName('quote')
                .setDescription('De quote text')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt
                .setName('whosaidit')
                .setDescription('Who said this')
                .setRequired(true)
        ),

    async execute(interaction, db) {
        try {
            const text = interaction.options.getString('quote');
            const author = interaction.options.getString('whosaidit') || 'Unknown';

            const stmt = db.prepare(
                'INSERT INTO quotes (text, author, submitter) VALUES (?, ?, ?)'
            );
            const info = stmt.run(text, author, interaction.user.id);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Quote Added')
                        .setDescription(`**Quote Number**: ${info.lastInsertRowid}\n> “${text}”\n> – ${author}`)
                        .setColor('#00aa00')
                ],
                ephemeral: false
            });

        } catch (err) {
            console.error('Error in /quotes-add:', err);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'An unexpected error occurred while adding the quote!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'An unexpected error occurred while adding the quote!',
                    ephemeral: true
                });
            }
        }
    },
};