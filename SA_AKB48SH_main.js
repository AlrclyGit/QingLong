/**
 * @new Env("俊介：AKB48TeamSH 新闻监控")
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
        this.pageName = 'AKB48TeamSH'
        this.pageDom = '.myactivity'
        this.barkID = process.env.barkID
    }

    /**
     * 主函数 
     */
    main() {
        this.getNews()
    }

    /**
     * 获取新闻列表
     */
    getNews() {
        axios(this.pageUrl, {
            method: "GET",
        }).then((res) => {
            this.newDB = cheerio.load(res.data)(this.pageDom).html()
            fs.readFile("./db.json", (err, data) => {
                if (err) {
                    this.setDB(false)
                } else {
                    let oldDB = JSON.parse(data)
                    if (oldDB[this.pageName] == this.newDB) {
                        console.log('无变化')
                    } else {
                        console.log('有变化')
                        axios.get(`https://bark.alrcly.com/${this.barkID}/AKB48TeamSH 有新闻！`)
                        this.setDB(oldDB)
                    }
                }
            });
        })
    }

    /**
     * 写入一条信息
     */
    setDB(oldDB) {
        oldDB = oldDB ? oldDB : {}
        oldDB[this.pageName] = this.newDB
        fs.writeFile("./db.json", JSON.stringify(oldDB), (err) => {
            if (!err) console.log("写入成功");
        });
    }
}

new Run().main()