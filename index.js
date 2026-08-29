import "dotenv/config";

import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

// ============================================================
// CONFIG
// ============================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

const SELLAUTH_API_KEY = process.env.SELLAUTH_API_KEY;
const SELLAUTH_SHOP_ID = process.env.SELLAUTH_SHOP_ID;

const API_BASE = "https://api.sellauth.com/v1";

// ============================================================
// ENV CHECK
// ============================================================

const missing = [];

if (!DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
if (!DISCORD_GUILD_ID) missing.push("DISCORD_GUILD_ID");
if (!SELLAUTH_API_KEY) missing.push("SELLAUTH_API_KEY");
if (!SELLAUTH_SHOP_ID) missing.push("SELLAUTH_SHOP_ID");

if (missing.length > 0) {
    console.error("");
    console.error("======================================");
    console.error("❌ MISSING ENVIRONMENT VARIABLES");
    console.error("======================================");

    for (const name of missing) {
        console.error(`❌ ${name}`);
    }

    console.error("");
    console.error("Check your .env file.");
    process.exit(1);
}

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("ticketpanel")
        .setDescription("Send the ZZZ support ticket panel")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator.toString()
        ),

    new SlashCommandBuilder()
        .setName("transaction")
        .setDescription("Check a SellAuth transaction")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("SellAuth transaction ID")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator.toString()
        ),

    new SlashCommandBuilder()
        .setName("close")
        .setDescription("Close the current ticket")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator.toString()
        )

].map(command => command.toJSON());

// ============================================================
// UTILITY
// ============================================================

function safe(value, fallback = "N/A") {

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return fallback;
    }

    return String(value);
}

function truncate(value, max = 1024) {

    const text = safe(value);

    if (text.length <= max) {
        return text;
    }

    return text.substring(0, max - 3) + "...";
}

function discordDate(date) {

    if (!date) {
        return "N/A";
    }

    const timestamp =
        Math.floor(
            new Date(date).getTime() / 1000
        );

    if (!Number.isFinite(timestamp)) {
        return "N/A";
    }

    return `<t:${timestamp}:F>`;
}

function formatMoney(value, currency = "EUR") {

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "N/A";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return `${value} ${currency}`.trim();
    }

    return `${number.toFixed(2)} ${currency}`.trim();
}

// ============================================================
// SELLAUTH API REQUEST
// ============================================================

async function sellAuthRequest(endpoint, options = {}) {

    const url =
        `${API_BASE}${endpoint}`;

    console.log("");
    console.log("======================================");
    console.log("🌐 SELLAUTH API REQUEST");
    console.log("======================================");
    console.log(
        `${options.method || "GET"} ${url}`
    );
    console.log(
        `🏪 Shop ID: ${SELLAUTH_SHOP_ID}`
    );

    const response =
        await fetch(
            url,
            {
                method:
                    options.method || "GET",

                headers: {
                    "Authorization":
                        `Bearer ${SELLAUTH_API_KEY}`,

                    "Accept":
                        "application/json",

                    "Content-Type":
                        "application/json"
                },

                body:
                    options.body
                        ? JSON.stringify(options.body)
                        : undefined
            }
        );

    const text =
        await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    console.log(
        `⬅️ HTTP ${response.status}`
    );

    if (!response.ok) {

        console.error(
            "❌ SellAuth API response:"
        );

        console.error(data);

        const error =
            new Error(
                `HTTP ${response.status}: ${
                    data?.message ||
                    response.statusText ||
                    "SellAuth API error"
                }`
            );

        error.status =
            response.status;

        error.data =
            data;

        throw error;
    }

    console.log(
        "✅ SellAuth request successful."
    );

    return data;
}

// ============================================================
// EXTRACT INVOICE ID
// ============================================================

function extractInvoiceId(transactionId) {

    const clean =
        transactionId.trim();

    /*
        Supports:

        01486b62a2dd7-0000015423083
        3fc20a79f3756-0000015413024
    */

    const match =
        clean.match(
            /-(\d+)$/
        );

    if (!match) {
        throw new Error(
            "INVALID_TRANSACTION_ID"
        );
    }

    return match[1];
}

// ============================================================
// GET INVOICE
// ============================================================

async function getInvoice(transactionId) {

    const clean =
        transactionId.trim();

    const invoiceId =
        extractInvoiceId(
            clean
        );

    console.log("");
    console.log("======================================");
    console.log("🔎 TRANSACTION LOOKUP");
    console.log("======================================");
    console.log(
        `🔖 Transaction: ${clean}`
    );
    console.log(
        `🧾 Invoice ID: ${invoiceId}`
    );

    const result =
        await sellAuthRequest(
            `/shops/${SELLAUTH_SHOP_ID}/invoices/${invoiceId}`
        );

    const invoice =
        result?.data ||
        result;

    if (!invoice || !invoice.id) {
        throw new Error(
            "INVALID_INVOICE_RESPONSE"
        );
    }

    console.log(
        "✅ Invoice received."
    );

    return invoice;
}

// ============================================================
// GET PRODUCT
// ============================================================

async function getProduct(productId) {

    if (!productId) {
        return null;
    }

    try {

        const result =
            await sellAuthRequest(
                `/shops/${SELLAUTH_SHOP_ID}/products/${productId}`
            );

        return (
            result?.data ||
            result
        );

    } catch (error) {

        console.log(
            `⚠️ Product lookup failed: ${error.message}`
        );

        return null;
    }
}

// ============================================================
// GET PURCHASE
// ============================================================

async function getPurchase(transactionId) {

    const invoice =
        await getInvoice(
            transactionId
        );

    const items =
        Array.isArray(invoice.items)
            ? invoice.items
            : [];

    const firstItem =
        items[0] || {};

    const productFromInvoice =
        firstItem.product || {};

    const variantFromInvoice =
        firstItem.variant || {};

    const productId =
        firstItem.product_id ||
        productFromInvoice.id;

    let product =
        productFromInvoice;

    /*
        Only request the product separately if
        the invoice did not already contain enough data.
    */

    if (
        productId &&
        !product?.name
    ) {

        product =
            await getProduct(
                productId
            );
    }

    return {
        invoice,
        items,
        firstItem,
        product,
        variant: variantFromInvoice
    };
}

// ============================================================
// PRODUCT NAME
// ============================================================

function getProductName(purchase) {

    const item =
        purchase.firstItem || {};

    const product =
        purchase.product || {};

    return safe(
        product.name ||
        item.custom_name ||
        item.product_name,
        "N/A"
    );
}

// ============================================================
// VARIANT
// ============================================================

function getVariantName(purchase) {

    const item =
        purchase.firstItem || {};

    const variant =
        purchase.variant || {};

    return safe(
        variant.name ||
        item.variant_name,
        "Default"
    );
}

// ============================================================
// AMOUNT
// ============================================================

function getAmount(purchase) {

    const invoice =
        purchase.invoice || {};

    const item =
        purchase.firstItem || {};

    /*
        Important:

        Your raw invoice showed:

        item.price = 0.45
        item.coupon_discount = 0.45
        item.total_price = 0.00

        So we display the actual final amount paid
        while also showing the original item price
        if there was a discount.
    */

    const currency =
        invoice.currency ||
        "EUR";

    const finalPrice =
        Number(
            invoice.paid ??
            invoice.price ??
            item.total_price ??
            0
        );

    const originalPrice =
        Number(
            item.price ??
            0
        );

    const couponDiscount =
        Number(
            item.coupon_discount ??
            0
        );

    if (
        Number.isFinite(finalPrice) &&
        Number.isFinite(originalPrice) &&
        originalPrice > finalPrice
    ) {

        return (
            `${formatMoney(finalPrice, currency)} ` +
            `~~${formatMoney(originalPrice, currency)}~~`
        );
    }

    if (Number.isFinite(finalPrice)) {
        return formatMoney(
            finalPrice,
            currency
        );
    }

    if (Number.isFinite(originalPrice)) {
        return formatMoney(
            originalPrice,
            currency
        );
    }

    return "N/A";
}

// ============================================================
// PAYMENT METHOD
// ============================================================

function getPaymentMethod(purchase) {

    const invoice =
        purchase.invoice || {};

    return safe(
        invoice.payment_method?.name ||
        invoice.gateway,
        "N/A"
    );
}

// ============================================================
// PAYMENT REFERENCE
// ============================================================

function getPaymentReference(purchase) {

    const invoice =
        purchase.invoice || {};

    const payments =
        Array.isArray(invoice.payments)
            ? invoice.payments
            : [];

    /*
        SellAuth can expose the transaction reference
        in different places depending on payment method.
    */

    const candidates = [

        invoice.transaction_id,

        invoice.crypto_address,

        invoice.crypto_amount,

        invoice.cashapp_cashtag,

        invoice.cashapp_note,

        invoice.cashapp_email,

        invoice.venmo_tag,

        invoice.venmo_email,

        invoice.sumup_checkout_id,

        invoice.revolutbusiness_token,

        ...payments.map(
            payment =>
                payment?.transaction_id ||
                payment?.txid ||
                payment?.id ||
                payment?.reference
        )

    ];

    for (const value of candidates) {

        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            return String(value);
        }
    }

    return "N/A";
}

// ============================================================
// CUSTOMER EMAIL
// ============================================================

function getEmail(purchase) {

    const invoice =
        purchase.invoice || {};

    return safe(
        invoice.email ||
        invoice.customer?.email,
        "N/A"
    );
}

// ============================================================
// IP
// ============================================================

function getIP(purchase) {

    return safe(
        purchase.invoice?.ip,
        "N/A"
    );
}

// ============================================================
// USER AGENT
// ============================================================

function getUserAgent(purchase) {

    return safe(
        purchase.invoice?.user_agent,
        "N/A"
    );
}

// ============================================================
// STATUS
// ============================================================

function getStatus(purchase) {

    const status =
        purchase.invoice?.status;

    return safe(
        status,
        "N/A"
    )
        .replace(
            /_/g,
            " "
        )
        .replace(
            /\b\w/g,
            char =>
                char.toUpperCase()
        );
}

// ============================================================
// ADDITIONAL INFORMATION
// ============================================================

function getAdditionalInformation(purchase) {

    const invoice =
        purchase.invoice || {};

    const item =
        purchase.firstItem || {};

    const lines = [];

    // --------------------------------------------------------
    // Invoice custom fields
    // --------------------------------------------------------

    if (
        Array.isArray(
            invoice.custom_fields
        )
    ) {

        for (
            const field
            of invoice.custom_fields
        ) {

            const label =
                field.label ||
                field.name ||
                field.key ||
                "Information";

            const value =
                field.value ??
                field.answer ??
                "N/A";

            lines.push(
                `**${label}:** ${value}`
            );
        }
    }

    // --------------------------------------------------------
    // Item custom fields
    // --------------------------------------------------------

    if (
        Array.isArray(
            item.custom_fields
        )
    ) {

        for (
            const field
            of item.custom_fields
        ) {

            const label =
                field.label ||
                field.name ||
                field.key ||
                "Information";

            const value =
                field.value ??
                field.answer ??
                "N/A";

            lines.push(
                `**${label}:** ${value}`
            );
        }
    }

    // --------------------------------------------------------
    // Customer information
    // --------------------------------------------------------

    if (
        invoice.customer?.discord_username
    ) {

        lines.push(
            `**Discord:** ${invoice.customer.discord_username}`
        );
    }

    if (
        invoice.country_code
    ) {

        lines.push(
            `**Country:** ${invoice.country_code}`
        );
    }

    if (
        invoice.source
    ) {

        lines.push(
            `**Source:** ${invoice.source}`
        );
    }

    if (lines.length === 0) {
        return "No additional information provided.";
    }

    return truncate(
        lines.join("\n"),
        1024
    );
}

// ============================================================
// DELIVERED CONTENT
// ============================================================

function getDelivered(purchase) {

    const items =
        purchase.items || [];

    const delivered = [];

    for (
        const item
        of items
    ) {

        if (
            Array.isArray(
                item.delivered
            )
        ) {

            for (
                const value
                of item.delivered
            ) {

                if (
                    value !== undefined &&
                    value !== null &&
                    value !== ""
                ) {

                    delivered.push(
                        String(value)
                    );
                }
            }
        }

        else if (
            typeof item.delivered ===
            "string"
        ) {

            delivered.push(
                item.delivered
            );
        }
    }

    if (
        delivered.length === 0
    ) {

        return "No delivered content.";
    }

    return truncate(
        delivered.join("\n"),
        900
    );
}

// ============================================================
// CREATE PURCHASE EMBED
// ============================================================

function createPurchaseEmbed(
    purchase,
    transactionId
) {

    const invoice =
        purchase.invoice;

    const productName =
        getProductName(
            purchase
        );

    const variantName =
        getVariantName(
            purchase
        );

    const amount =
        getAmount(
            purchase
        );

    const status =
        getStatus(
            purchase
        );

    const payment =
        getPaymentMethod(
            purchase
        );

    const paymentReference =
        getPaymentReference(
            purchase
        );

    const email =
        getEmail(
            purchase
        );

    const ip =
        getIP(
            purchase
        );

    const userAgent =
        getUserAgent(
            purchase
        );

    const additional =
        getAdditionalInformation(
            purchase
        );

    const delivered =
        getDelivered(
            purchase
        );

    const embed =
        new EmbedBuilder()

            .setTitle(
                "🧾  SellAuth Purchase"
            )

            .setDescription(
                "✅ **Purchase successfully verified**\n" +
                "The information below was retrieved directly from SellAuth."
            )

            .addFields(

                {
                    name:
                        "🔖 Transaction ID",

                    value:
                        `\`${transactionId}\``,

                    inline:
                        false
                },

                {
                    name:
                        "📦 Product",

                    value:
                        truncate(
                            productName,
                            1024
                        ),

                    inline:
                        true
                },

                {
                    name:
                        "🔹 Variant",

                    value:
                        truncate(
                            variantName,
                            1024
                        ),

                    inline:
                        true
                },

                {
                    name:
                        "💰 Amount",

                    value:
                        amount,

                    inline:
                        true
                },

                {
                    name:
                        "📊 Status",

                    value:
                        `\`${status}\``,

                    inline:
                        true
                },

                {
                    name:
                        "💳 Payment",

                    value:
                        payment,

                    inline:
                        true
                },

                {
                    name:
                        "📧 Customer",

                    value:
                        truncate(
                            email,
                            1024
                        ),

                    inline:
                        true
                },

                {
                    name:
                        "🔑 Payment Reference",

                    value:
                        `\`${truncate(
                            paymentReference,
                            1020
                        )}\``,

                    inline:
                        false
                },

                {
                    name:
                        "📝 Additional Information",

                    value:
                        additional,

                    inline:
                        false
                },

                {
                    name:
                        "📦 Delivered",

                    value:
                        `\`\`\`\n${delivered}\n\`\`\``,

                    inline:
                        false
                },

                {
                    name:
                        "📅 Created",

                    value:
                        discordDate(
                            invoice.created_at
                        ),

                    inline:
                        true
                },

                {
                    name:
                        "✅ Completed",

                    value:
                        discordDate(
                            invoice.completed_at
                        ),

                    inline:
                        true
                },

                {
                    name:
                        "🌐 IP Address",

                    value:
                        ip,

                    inline:
                        true
                },

                {
                    name:
                        "💻 User Agent",

                    value:
                        truncate(
                            userAgent,
                            1024
                        ),

                    inline:
                        false
                }

            )

            .setFooter({
                text:
                    "ZZZ Shop • SellAuth Verification"
            })

            .setTimestamp();

    return embed;
}

// ============================================================
// ADDITIONAL INFORMATION TICKET BOX
// ============================================================

function createAdditionalInformationEmbed(
    purchase,
    transactionId
) {

    const invoice =
        purchase.invoice;

    const product =
        getProductName(
            purchase
        );

    const variant =
        getVariantName(
            purchase
        );

    const amount =
        getAmount(
            purchase
        );

    const additional =
        getAdditionalInformation(
            purchase
        );

    return new EmbedBuilder()

        .setTitle(
            "📝  Additional Information"
        )

        .setDescription(
            "Here is the additional information associated with this purchase."
        )

        .addFields(

            {
                name:
                    "📦 Product",

                value:
                    truncate(
                        product
                    ),

                inline:
                    true
            },

            {
                name:
                    "🔹 Variant",

                value:
                    truncate(
                        variant
                    ),

                inline:
                    true
            },

            {
                name:
                    "💰 Amount",

                value:
                    amount,

                inline:
                    true
            },

            {
                name:
                    "🔖 Invoice",

                value:
                    `\`${safe(invoice.id)}\``,

                inline:
                    true
            },

            {
                name:
                    "📝 Information",

                value:
                    additional,

                inline:
                    false
            }

        )

        .setFooter({
            text:
                `Transaction • ${transactionId}`
        });
}

// ============================================================
// CLOSE BUTTON
// ============================================================

function closeButton() {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()

                .setCustomId(
                    "close_ticket"
                )

                .setLabel(
                    "Close Ticket"
                )

                .setEmoji(
                    "🔒"
                )

                .setStyle(
                    ButtonStyle.Danger
                )

        );
}

// ============================================================
// TICKET PANEL
// ============================================================

function createTicketPanel() {

    const embed =
        new EmbedBuilder()

            .setTitle(
                "🎫  ZZZ Support"
            )

            .setDescription(
                "**Need help with an order?**\n\n" +
                "Click the button below to create a private support ticket.\n\n" +
                "You'll be asked for your **SellAuth transaction ID**."
            )

            .addFields({

                name:
                    "📌 Transaction ID Example",

                value:
                    "`01486b62a2dd7-0000015423083`",

                inline:
                    false
            })

            .addFields({

                name:
                    "🔒 Private Support",

                value:
                    "Your ticket will only be visible to you and the support team.",

                inline:
                    false
            })

            .setFooter({

                text:
                    "ZZZ Support • Purchase Verification"

            });

    const button =
        new ButtonBuilder()

            .setCustomId(
                "create_ticket"
            )

            .setLabel(
                "Create Ticket"
            )

            .setEmoji(
                "🎫"
            )

            .setStyle(
                ButtonStyle.Primary
            );

    return {
        embed,
        button
    };
}

// ============================================================
// READY
// ============================================================

client.once(
    "clientReady",
    async () => {

        console.log("");
        console.log(
            "======================================"
        );

        console.log(
            `✅ Logged in as ${client.user.tag}`
        );

        console.log(
            `🏪 SellAuth Shop ID: ${SELLAUTH_SHOP_ID}`
        );

        console.log(
            "======================================"
        );

        // ----------------------------------------------------
        // TEST SELLAUTH
        // ----------------------------------------------------

        try {

            console.log("");
            console.log(
                "🔐 TESTING SELLAUTH API"
            );

            await sellAuthRequest(
                `/shops/${SELLAUTH_SHOP_ID}`
            );

            console.log("");
            console.log(
                "======================================"
            );

            console.log(
                "✅ SELLAUTH AUTHENTICATION WORKS"
            );

            console.log(
                "======================================"
            );

        } catch (error) {

            console.error("");
            console.error(
                "======================================"
            );

            console.error(
                "❌ SELLAUTH AUTHENTICATION FAILED"
            );

            console.error(
                "======================================"
            );

            console.error(
                error
            );

            return;
        }

        // ----------------------------------------------------
        // REGISTER COMMANDS
        // ----------------------------------------------------

        try {

            console.log(
                "🔄 Registering Discord commands..."
            );

            const rest =
                new REST({
                    version: "10"
                })
                .setToken(
                    DISCORD_TOKEN
                );

            await rest.put(

                Routes.applicationGuildCommands(
                    client.user.id,
                    DISCORD_GUILD_ID
                ),

                {
                    body:
                        commands
                }
            );

            console.log(
                "✅ Discord commands registered!"
            );

            console.log(
                "🔐 Admin commands: Administrator only"
            );

            console.log(
                "🎫 Ticket creation: Everyone"
            );

            console.log(
                "🤖 ZZZ bot is ready!"
            );

        } catch (error) {

            console.error(
                "❌ Discord command registration failed:"
            );

            console.error(
                error
            );
        }
    }
);

// ============================================================
// INTERACTIONS
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        try {

            // =================================================
            // ADMIN COMMAND PROTECTION
            // =================================================

            if (
                interaction.isChatInputCommand()
            ) {

                const isAdmin =
                    interaction
                        .memberPermissions
                        ?.has(
                            PermissionFlagsBits.Administrator
                        );

                if (!isAdmin) {

                    await interaction.reply({

                        content:
                            "❌ You need **Administrator** permission to use this command.",

                        ephemeral:
                            true

                    });

                    return;
                }
            }

            // =================================================
            // /TICKETPANEL
            // =================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName ===
                    "ticketpanel"
            ) {

                const panel =
                    createTicketPanel();

                await interaction.reply({

                    embeds:
                        [
                            panel.embed
                        ],

                    components:
                        [
                            new ActionRowBuilder()
                                .addComponents(
                                    panel.button
                                )
                        ]

                });

                return;
            }

            // =================================================
            // CREATE TICKET
            // =================================================

            if (
                interaction.isButton() &&
                interaction.customId ===
                    "create_ticket"
            ) {

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            "transaction_modal"
                        )

                        .setTitle(
                            "ZZZ Support Ticket"
                        );

                const transactionInput =
                    new TextInputBuilder()

                        .setCustomId(
                            "transaction_id"
                        )

                        .setLabel(
                            "SellAuth Transaction ID"
                        )

                        .setPlaceholder(
                            "01486b62a2dd7-0000015423083"
                        )

                        .setStyle(
                            TextInputStyle.Short
                        )

                        .setRequired(
                            true
                        );

                const informationInput =
                    new TextInputBuilder()

                        .setCustomId(
                            "additional_information"
                        )

                        .setLabel(
                            "Additional Information"
                        )

                        .setPlaceholder(
                            "Tell us what you need help with..."
                        )

                        .setStyle(
                            TextInputStyle.Paragraph
                        )

                        .setRequired(
                            false
                        );

                modal.addComponents(

                    new ActionRowBuilder()
                        .addComponents(
                            transactionInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            informationInput
                        )

                );

                await interaction.showModal(
                    modal
                );

                return;
            }

            // =================================================
            // TRANSACTION MODAL
            // =================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    "transaction_modal"
            ) {

                const transactionId =
                    interaction.fields
                        .getTextInputValue(
                            "transaction_id"
                        )
                        .trim();

                const userInformation =
                    interaction.fields
                        .getTextInputValue(
                            "additional_information"
                        )
                        .trim();

                await interaction.deferReply({
                    ephemeral: true
                });

                // ------------------------------------------------
                // GET PURCHASE
                // ------------------------------------------------

                let purchase;

                try {

                    purchase =
                        await getPurchase(
                            transactionId
                        );

                } catch (error) {

                    console.error("");
                    console.error(
                        "======================================"
                    );

                    console.error(
                        "❌ SELLAUTH LOOKUP FAILED"
                    );

                    console.error(
                        "======================================"
                    );

                    console.error(
                        error
                    );

                    if (
                        error.message ===
                        "INVALID_TRANSACTION_ID"
                    ) {

                        await interaction.editReply(
                            "❌ **Invalid transaction ID.**\n\n" +
                            "Example:\n" +
                            "`01486b62a2dd7-0000015423083`"
                        );

                        return;
                    }

                    if (
                        error.status ===
                        401
                    ) {

                        await interaction.editReply(
                            "❌ **SellAuth authentication failed.**\n\n" +
                            "Your API key was rejected."
                        );

                        return;
                    }

                    if (
                        error.status ===
                        403
                    ) {

                        await interaction.editReply(
                            "❌ **SellAuth denied access to the shop.**"
                        );

                        return;
                    }

                    if (
                        error.status ===
                        404
                    ) {

                        await interaction.editReply(
                            "❌ **Transaction not found.**\n\n" +
                            "Make sure you copied the complete SellAuth transaction ID."
                        );

                        return;
                    }

                    await interaction.editReply(
                        "❌ **SellAuth API error.**\n\n" +
                        "Check the bot console for details."
                    );

                    return;
                }

                // ------------------------------------------------
                // CATEGORY
                // ------------------------------------------------

                const guild =
                    interaction.guild;

                const category =
                    guild.channels.cache.find(
                        channel =>
                            channel.type ===
                                ChannelType.GuildCategory &&
                            channel.name
                                .toLowerCase() ===
                                "🎫 tickets"
                    );

                if (!category) {

                    await interaction.editReply(
                        "❌ I couldn't find the `🎫 tickets` category.\n\n" +
                        "Create a category named exactly:\n" +
                        "`🎫 Tickets`"
                    );

                    return;
                }

                // ------------------------------------------------
                // CHECK EXISTING TICKET
                // ------------------------------------------------

                const existing =
                    guild.channels.cache.find(
                        channel =>
                            channel.parentId ===
                                category.id &&
                            channel.name ===
                                `ticket-${interaction.user.id}`
                    );

                if (existing) {

                    await interaction.editReply(
                        `❌ You already have an open ticket: ${existing}`
                    );

                    return;
                }

                // ------------------------------------------------
                // CREATE TICKET
                // ------------------------------------------------

                let ticket;

                try {

                    ticket =
                        await guild.channels.create({

                            name:
                                `ticket-${interaction.user.id}`,

                            type:
                                ChannelType.GuildText,

                            parent:
                                category.id,

                            permissionOverwrites: [

                                {
                                    id:
                                        guild.roles.everyone.id,

                                    deny:
                                        [
                                            PermissionFlagsBits.ViewChannel
                                        ]
                                },

                                {
                                    id:
                                        interaction.user.id,

                                    allow:
                                        [
                                            PermissionFlagsBits.ViewChannel,
                                            PermissionFlagsBits.SendMessages,
                                            PermissionFlagsBits.ReadMessageHistory
                                        ]
                                },

                                {
                                    id:
                                        client.user.id,

                                    allow:
                                        [
                                            PermissionFlagsBits.ViewChannel,
                                            PermissionFlagsBits.SendMessages,
                                            PermissionFlagsBits.ReadMessageHistory,
                                            PermissionFlagsBits.ManageChannels,
                                            PermissionFlagsBits.ManageMessages
                                        ]
                                }

                            ]

                        });

                } catch (error) {

                    console.error(
                        "❌ Ticket creation error:",
                        error
                    );

                    await interaction.editReply(
                        "❌ I couldn't create the ticket.\n\n" +
                        "Make sure the bot has **Manage Channels** permission."
                    );

                    return;
                }

                // ------------------------------------------------
                // USER RESPONSE
                // ------------------------------------------------

                await interaction.editReply({

                    content:
                        `✅ **Purchase verified successfully!**\n\n` +
                        `🎫 Your ticket: ${ticket}`

                });

                // ------------------------------------------------
                // WELCOME EMBED
                // ------------------------------------------------

                const welcome =
                    new EmbedBuilder()

                        .setTitle(
                            "🎫  ZZZ Support Ticket"
                        )

                        .setDescription(
                            `Welcome ${interaction.user}!\n\n` +
                            "Your purchase has been **successfully verified**.\n\n" +
                            "A support member will assist you shortly."
                        )

                        .addFields(

                            {
                                name:
                                    "👤 Customer",

                                value:
                                    `${interaction.user}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "🔖 Transaction",

                                value:
                                    `\`${transactionId}\``,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "📦 Product",

                                value:
                                    truncate(
                                        getProductName(
                                            purchase
                                        )
                                    ),

                                inline:
                                    false
                            }

                        )

                        .setFooter({

                            text:
                                "ZZZ Support"

                        })

                        .setTimestamp();

                // ------------------------------------------------
                // USER'S ADDITIONAL INFORMATION
                // ------------------------------------------------

                const userInfoEmbed =
                    new EmbedBuilder()

                        .setTitle(
                            "📝  Customer Information"
                        )

                        .setDescription(
                            userInformation
                                ? truncate(
                                    userInformation,
                                    4000
                                )
                                : "No additional information was provided."
                        )

                        .setFooter({

                            text:
                                "Information submitted when creating the ticket"

                        });

                // ------------------------------------------------
                // SELL AUTH ADDITIONAL INFORMATION
                // ------------------------------------------------

                const additionalEmbed =
                    createAdditionalInformationEmbed(
                        purchase,
                        transactionId
                    );

                // ------------------------------------------------
                // SEND TICKET
                // ------------------------------------------------

                await ticket.send({

                    content:
                        `${interaction.user}`,

                    embeds:
                        [
                            welcome,

                            createPurchaseEmbed(
                                purchase,
                                transactionId
                            ),

                            additionalEmbed,

                            userInfoEmbed
                        ],

                    components:
                        [
                            closeButton()
                        ]

                });

                console.log(
                    `🎫 Created ${ticket.name}`
                );

                return;
            }

            // =================================================
            // CLOSE BUTTON
            // =================================================

            if (
                interaction.isButton() &&
                interaction.customId ===
                    "close_ticket"
            ) {

                const channel =
                    interaction.channel;

                if (
                    !channel ||
                    !channel.name.startsWith(
                        "ticket-"
                    )
                ) {

                    await interaction.reply({

                        content:
                            "❌ This is not a ticket.",

                        ephemeral:
                            true

                    });

                    return;
                }

                const isAdmin =
                    interaction
                        .memberPermissions
                        ?.has(
                            PermissionFlagsBits.Administrator
                        );

                const isOwner =
                    channel.name ===
                        `ticket-${interaction.user.id}`;

                if (
                    !isAdmin &&
                    !isOwner
                ) {

                    await interaction.reply({

                        content:
                            "❌ You cannot close this ticket.",

                        ephemeral:
                            true

                    });

                    return;
                }

                await interaction.reply(
                    "🔒 **Closing ticket...**"
                );

                setTimeout(
                    async () => {

                        try {

                            await channel.delete(
                                "ZZZ support ticket closed"
                            );

                        } catch (error) {

                            console.error(
                                "❌ Ticket deletion error:",
                                error
                            );

                        }

                    },
                    1200
                );

                return;
            }

            // =================================================
            // /CLOSE
            // =================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName ===
                    "close"
            ) {

                const channel =
                    interaction.channel;

                if (
                    !channel ||
                    !channel.name.startsWith(
                        "ticket-"
                    )
                ) {

                    await interaction.reply({

                        content:
                            "❌ `/close` can only be used inside a ticket.",

                        ephemeral:
                            true

                    });

                    return;
                }

                await interaction.reply(
                    "🔒 **Closing ticket...**"
                );

                setTimeout(
                    async () => {

                        try {

                            await channel.delete(
                                "ZZZ support ticket closed"
                            );

                        } catch (error) {

                            console.error(
                                "❌ Ticket deletion error:",
                                error
                            );

                        }

                    },
                    1200
                );

                return;
            }

            // =================================================
            // /TRANSACTION
            // =================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName ===
                    "transaction"
            ) {

                const transactionId =
                    interaction.options
                        .getString("id")
                        .trim();

                await interaction.deferReply({
                    ephemeral: true
                });

                try {

                    const purchase =
                        await getPurchase(
                            transactionId
                        );

                    await interaction.editReply({

                        embeds:
                            [
                                createPurchaseEmbed(
                                    purchase,
                                    transactionId
                                ),

                                createAdditionalInformationEmbed(
                                    purchase,
                                    transactionId
                                )
                            ]

                    });

                } catch (error) {

                    console.error(
                        "❌ Transaction command error:",
                        error
                    );

                    if (
                        error.status ===
                        401
                    ) {

                        await interaction.editReply(
                            "❌ **SellAuth authentication failed.**"
                        );

                        return;
                    }

                    if (
                        error.status ===
                        403
                    ) {

                        await interaction.editReply(
                            "❌ **SellAuth denied access to the shop.**"
                        );

                        return;
                    }

                    if (
                        error.status ===
                        404
                    ) {

                        await interaction.editReply(
                            "❌ **Transaction not found.**"
                        );

                        return;
                    }

                    await interaction.editReply(
                        "❌ **SellAuth API error.**\n\n" +
                        "Check the CMD window."
                    );
                }

                return;
            }

        } catch (error) {

            console.error(
                "❌ Interaction error:",
                error
            );

            try {

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    await interaction.followUp({

                        content:
                            "❌ Something went wrong.",

                        ephemeral:
                            true

                    });

                } else {

                    await interaction.reply({

                        content:
                            "❌ Something went wrong.",

                        ephemeral:
                            true

                    });
                }

            } catch {
                // Ignore
            }
        }
    }
);

// ============================================================
// LOGIN
// ============================================================

console.log("");
console.log(
    "🤖 Starting ZZZ bot..."
);
console.log(
    `🏪 SellAuth Shop ID: ${SELLAUTH_SHOP_ID}`
);

client.login(
    DISCORD_TOKEN
);