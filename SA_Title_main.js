/**
 * @new Env("俊介：网站组标题监控")
 * @cron 1 0/15 * * * SA_Title_main.js
*/

const axios = require('axios')
const fs = require("fs")
const cheerio = require('cheerio')
const notify = require("./Tool_notify")

let pageTag = 'Title'
let newArray = []

async function getTitles(urls) {
    const titles = []
    for (const url of urls) {
        const response = await axios.get(url)
        const html = response.data
        const $ = cheerio.load(html)
        const title = $('title').text()
        titles.push(title)
    }
    return titles
}

urls = [
    'https://om.onyxcina.com',
    'https://ied.onyxcina.com',
    'https://pl.onyxcina.com',
    'https://naba.onyxcina.com',
    'https://da.onyxcina.com',
    'https://secoli.onyxcina.com',
    'https://raffles.onyxcina.com',
    'https://lao.onyxcina.com',
    'https://sls.onyxcina.com',
    'https://ism.onyxcina.com',
    'https://spd.onyxcina.com',
    'https://adl.onyxcina.com',
    'https://acm.onyxcina.com',
    'https://alchimia.onyxcina.com',
    'https://csvpa.onyxcina.com',
    'https://artbcu.onyxcina.com',
    'https://lisaa.onyxcina.com',
    'https://ip.onyxcina.com',
    'https://lv.onyxcina.com',
    'https://ldv.onyxcina.com',
    'https://bs.onyxcina.com',
    'https://regents.onyxcina.com/',
    'https://www.eonyx.cn',
    'https://www.ifhsc.com',
    'https://www.scuolaciao.com',
    'https://www.supdeluxe-recruiting.cn',
    'https://www.sdabocconi-recruiting.cn',
    'https://glion.ifhsc.com',
    'https://lr.ifhsc.com',
    'https://imi.ifhsc.com',
    'https://shms.ifhsc.com',
    'https://crcs.ifhsc.com',
    'https://surrey.ifhsc.com',
    'https://ucb.ifhsc.com',
    'https://bm.ifhsc.com',
    'https://pihms.ifhsc.com',
    'https://vatel.ifhsc.com',
    'https://eahm.ifhsc.com'
]

getTitles(urls).then(arr => {
    newArray = arr
    return getJsonDB()
}).then(jsonDB => {
    let oldArray = jsonDB[pageTag]
    let newStr = JSON.stringify(newArray)
    let oldStr = JSON.stringify(oldArray)
    if (newStr == oldStr) {
        console.log('无变化')
    } else {
        console.log('有变化')
        console.log(newArray)
        setDB(pageTag, newArray)
        notify('欧名网站标题发生了变化')
    }
}).catch(error => {
    console.log(error.message)
    notify('欧名网站标题发生了错误', error.message)
})


/**
  * 写入一条信息
  */
function setDB(key, value) {
    getJsonDB().then(jsonDB => {
        jsonDB[key] = value
        return setJsontDB(jsonDB)
    }, () => {
        const jsonDB = new Object
        jsonDB[key] = value
        console.log('第一次使用数据库')
        return setJsontDB(jsonDB)
    }).then(() => {
        console.log('写入数据成功')
    }).catch(error => {
        console.log(error.message)
    })
}

/**
 * 写入数据库
 */
function setJsontDB(jsonDB) {
    return new Promise((resolve, reject) => {
        fs.writeFile("./db.json", JSON.stringify(jsonDB), 'utf8', err => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
}

/**
 * 读取数据库
 */
function getJsonDB() {
    return new Promise((resolve, reject) => {
        fs.readFile("./db.json", 'utf8', (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(JSON.parse(data))
            }
        })
    })
}