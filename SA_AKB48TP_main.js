/**
 * @new Env("俊介：AKB48 甜品队新闻监控")
 * @cron 1 0/1 * * * SA_AKB48TP_main.js
*/

const axios = require("axios")
const fs = require("fs")
const cheerio = require("cheerio")
const notify = require("./Tool_Message")

class Run {

    /**
     * 设置属性 
     */
    constructor() {
        this.pageUrl = 'https://www.akb48teamtp.com/pages/news'
        this.pageTag = 'AKB48TeamTP'
    }

    /**
     * 主函数 
     */
    main() {
        axios.get(this.pageUrl)
            .then(response => {
                const $ = cheerio.load(response.data)
                this.title = $('#news > ul > li:nth-child(2) > a.title').html().trim()
                this.url = $('#news > ul > li:nth-child(2) > a.title').attr('href')
                return this.getJsonDB()
            }).then(jsonDB => {
                let oldPage = jsonDB[this.pageTag]
                if (oldPage == this.title) {
                    console.log('无变化')
                } else {
                    console.log('有变化')
                    this.setDB(this.pageTag, this.title)
                    notify('AKB48 甜品队新闻', this.title, this.url)
                }
            }).catch(error => {
                if (error.code = 'ENOENT') {
                    this.setDB(this.pageTag, this.title)
                    notify('AKB48 甜品队新闻', this.title, this.url)
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
            })
        })
    }

}

new Run().main()