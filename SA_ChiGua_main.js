/**
 * @new Env("俊介：百度吃瓜页面监控")
 * @cron 0/5 * * * * SA_ChiGua_main.js
*/

const axios = require("axios")
const fs = require("fs");
const cheerio = require("cheerio")

class Run {

    /**
     * 设置属性 
     */
    constructor() {
        this.pageUrls = process.env.chiGua
        this.pageTag = 'ChiGua'
        this.barkID = process.env.barkID
    }

    /**
     * 主函数 
     */
    main() {
        const pageUrls = this.pageUrls.split(';')
        for (let i = 0; i < pageUrls.length; i++) {
            axios(pageUrls[i], {
                method: "GET",
            }).then(res => {
                let $ = cheerio.load(res.data)
                this.newPage = $('.create-time').text()
                let itemTitle = $('.title').text()
                this.itemPageTag = `${this.pageTag}:${itemTitle}`
                let item = $('.list .content-link').first()
                this.title = item.text().trim()
                this.url = item.attr('href')
                return this.getJsonDB()
            }).then(jsonDB => {
                let oldPage = jsonDB[this.itemPageTag]
                if (oldPage == this.newPage) {
                    console.log('无变化')
                } else {
                    console.log('有变化')
                    this.setDB(this.itemPageTag, this.newPage)
                    axios.get(`https://bark.alrcly.com/${this.barkID}/${this.title}?url=${this.url}`)
                }
            }).catch(error => {
                if (error.code = 'ENOENT') {
                    this.setDB(this.itemPageTag, this.newPage)
                    axios.get(`https://bark.alrcly.com/${this.barkID}/${this.title}?url=${this.url}`)
                } else {
                    console.log(error.message)
                }
            })
        }

    }

    /**
      * 写入一条信息
      */
    setDB(key, value) {
        this.getJsonDB().then(jsonDB => {
            jsonDB[key] = value
            return this.setJsontDB(jsonDB)
        }, () => {
            const jsonDB = new Object
            jsonDB[key] = value
            console.log('第一次使用数据库')
            return this.setJsontDB(jsonDB)
        }).then(() => {
            console.log('写入数据成功')
        }).catch(error => {
            console.log(error.message)
        })
    }

    /**
     * 写入数据库
     */
    setJsontDB(jsonDB) {
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
    getJsonDB() {
        return new Promise((resolve, reject) => {
            fs.readFile("./db.json", 'utf8', (err, data) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(JSON.parse(data))
                }
            });
        })
    }

}

new Run().main()