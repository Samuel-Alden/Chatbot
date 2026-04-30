const db = require('../utils/db')

const lists = db.load('lists')

module.exports = {
    addList: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, {
            text: '❌ Usage: *!addlist name | content*\nExample: *!addlist rules | 1. Be nice\n2. No spam*'
        }, { quoted: msg })

        const [name, ...contentParts] = text.split('|')
        if (!name || !contentParts.length) return sock.sendMessage(from, {
            text: '❌ Please use the correct format!\nExample: *!addlist rules | 1. Be nice\n2. No spam*'
        }, { quoted: msg })

        const content = contentParts.join('|').trim()
        const listName = name.trim().toLowerCase()

        if (!lists[from]) lists[from] = {}
        if (lists[from][listName]) return sock.sendMessage(from, {
            text: `❌ A list named *${listName}* already exists! Use *!updatelist ${listName} | content* to update it.`
        }, { quoted: msg })

        lists[from][listName] = content
        db.save('lists', lists)
        await sock.sendMessage(from, { text: `✅ List *${listName}* has been added!` }, { quoted: msg })
    },

    updateList: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, {
            text: '❌ Usage: *!updatelist name | new content*'
        }, { quoted: msg })

        const [name, ...contentParts] = text.split('|')
        if (!name || !contentParts.length) return sock.sendMessage(from, {
            text: '❌ Please use the correct format!\nExample: *!updatelist rules | new rules here*'
        }, { quoted: msg })

        const listName = name.trim().toLowerCase()
        const content = contentParts.join('|').trim()

        if (!lists[from]?.[listName]) return sock.sendMessage(from, {
            text: `❌ List *${listName}* not found! Use *!addlist* to create it first.`
        }, { quoted: msg })

        lists[from][listName] = content
        db.save('lists', lists)
        await sock.sendMessage(from, { text: `✅ List *${listName}* has been updated!` }, { quoted: msg })
    },

    getList: async ({ sock, from, msg, isGroup, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        if (!text) {
            const groupLists = lists[from]
            if (!groupLists || !Object.keys(groupLists).length) {
                return sock.sendMessage(from, { text: '📋 No lists found in this group!' }, { quoted: msg })
            }
            const listNames = Object.keys(groupLists).map((name, i) => `${i + 1}. ${name}`).join('\n')
            return sock.sendMessage(from, {
                text: `📋 *Available Lists:*\n\n${listNames}\n\nType *!getlist [name]* to view a list.`
            }, { quoted: msg })
        }

        const listName = text.trim().toLowerCase()
        const content = lists[from]?.[listName]

        if (!content) return sock.sendMessage(from, {
            text: `❌ List *${listName}* not found!`
        }, { quoted: msg })

        await sock.sendMessage(from, {
            text: `📋 *${listName}*\n\n${content}`
        }, { quoted: msg })
    },

    delList: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, { text: '❌ Please provide a list name!\nExample: *!dellist rules*' }, { quoted: msg })

        const listName = text.trim().toLowerCase()
        if (!lists[from]?.[listName]) return sock.sendMessage(from, {
            text: `❌ List *${listName}* not found!`
        }, { quoted: msg })

        delete lists[from][listName]
        db.save('lists', lists)
        await sock.sendMessage(from, { text: `✅ List *${listName}* has been deleted!` }, { quoted: msg })
    },

    resetList: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        lists[from] = {}
        db.save('lists', lists)
        await sock.sendMessage(from, { text: '✅ All lists have been reset!' }, { quoted: msg })
    }
}