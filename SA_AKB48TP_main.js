/**
 * @new Env("俊介：AKB48 甜品队新闻监控")
 * @cron 1 0/1 * * * SA_AKB48TP_main.js
*/

const axios = require("axios")
const fs = require("fs");
const cheerio = require("cheerio")

class Run {

    /**
     * 设置属性 
     */
    constructor() {
        this.pageUrl = 'https://www.akb48teamtp.com/blogs/news'
        this.pageTag = 'AKB48TeamTP'
        this.barkID = process.env.barkID
        this.barkID = 'iyeuCNEfFuyaX4KHzemdoJ'
    }

    /**
     * 主函数 
     */
    main() {
        axios.get(this.pageUrl)
            .then(response => {
                const $ = cheerio.load(response.data)
                this.title = $('#blog_articles > div:nth-child(4) > p > a').html().trim()
                let url = $('#blog_articles > div:nth-child(4) > p > a').attr('href')
                this.url = `https://www.akb48teamtp.com${url}`
                return this.getJsonDB()
            }).then(jsonDB => {
                let oldPage = jsonDB[this.pageTag]
                if (oldPage == this.title) {
                    console.log('无变化')z
                } else {
                    console.log('有变化')
                    this.setDB(this.pageTag, this.title)
                    axios.post(`https://bark.alrcly.com/${this.barkID}/`, {
                        'title': 'AKB48 甜品队新闻',
                        'body': this.title,
                        'url': this.url
                    })
                }
            }).catch(error => {
                if (error.code = 'ENOENT') {
                    this.setDB(this.pageTag, this.title)
                    axios.post(`https://bark.alrcly.com/${this.barkID}/`, {
                        'title': 'AKB48 甜品队新闻',
                        'body': this.title,
                        'url': this.url
                    })
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