/**
 * @new Env("俊介：AKB48 社会队新闻监控")
 * @cron 1 0/1 * * * SA_AKB48SH_main.js
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
        this.barkID = process.env.barkID
    }

    /**
     * 主函数 
     */
    main() {
        axios(this.pageUrl, {
            method: "GET",
        }).then(res => {
            this.newPage = cheerio.load(res.data)('.myactivity > ul > li:nth-child(1) > div.li-right > span').html()
            return this.getJsonDB()
        }).then(jsonDB => {
            let oldPage = jsonDB[this.pageTag]
            if (oldPage == this.newPage) {
                console.log('无变化')
            } else {
                console.log('有变化')
                this.setDB(this.pageTag, this.newPage)
                axios.get(`https://bark.alrcly.com/${this.barkID}/${this.pageTag}监控页面发生了变化！`)
            }
        }).catch(error => {
            if (error.code = 'ENOENT') {
                this.setDB(this.pageTag, this.newPage)
                axios.get(`https://bark.alrcly.com/${this.barkID}/${this.pageTag}监控页面发生了变化！`)
            } else {
                console.log(error.message)
            }
        })
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