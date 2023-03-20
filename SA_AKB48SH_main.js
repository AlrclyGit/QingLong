/**
 * @new Env("AKB48TeamSH 新闻监控")
 * @cron 0 0/1 * * * SA_AKB48SH_main.js
*/

const axios = require("axios")
const fs = require("fs");
const cheerio = require("cheerio")

class Run {

    /**
     * 设置属性 
     */
    constructor() {
        this.pageUrl = 'http://www.akb48-china.com/official-notice/'
        this.pageTag = 'AKB48TeamSH'
        this.pageDom = '.myactivity'
        this.barkID = process.env.barkID
    }

    /**
     * 主函数 
     */
    main() {
        axios(this.pageUrl, {
            method: "GET",
        }).then(res => {
            this.newPage = cheerio.load(res.data)(this.pageDom).html()
            return this.getJsonDB()
        }).then(jsonDB => {
            let oldPage = jsonDB[this.pageTag]
            if (oldPage == this.newPage) {
                console.log('无变化')
            } else {
                console.log('有变化')
                this.setDB(this.pageTag, this.newPage)
                // axios.get(`https://bark.alrcly.com/${this.barkID}/AKB48TeamSH 有新闻！`)
            }
        }, () => {
            this.setDB(this.pageTag, this.newPage)
        })

    }

    /**
     * 读取数据库
     */
    getJsonDB() {
        return new Promise((resolve, reject) => {
            fs.readFile("./db.json", (err, DB) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(JSON.parse(DB))
                }
            });
        })

    }

    /**
     * 写入一条信息
     */
    setDB(key, value) {
        this.getJsonDB()
            .then(jsonDB => {
                jsonDB[key] = value
                fs.writeFile("./db.json", JSON.stringify(jsonDB), err => {
                    if (err) throw err
                    console.log("写入成功")
                })
            }, () => {
                fs.writeFile("./db.json", JSON.stringify({}), err => {
                    if (err) throw err
                    console.log("写入成功")
                })
            })
    }
}

new Run().main()