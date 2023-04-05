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
        this.pageUrl = 'https://events.baidu.com/search/vein?platform=pc&record_id=20786'
        this.pageTag = 'ChiGua'
        this.pageDom = '.create-time'
        this.barkID = process.env.barkID
    }

    /**
     * 主函数 
     */
    main() {
        axios(this.pageUrl, {
            method: "GET",
        }).then(res => {
            let $ = cheerio.load(res.data)
            this.newPage = $(this.pageDom).html()
            let item = $('.list .content-link').first()
            this.title = item.text().trim()
            this.url = item.attr('href')
            return this.getJsonDB()
        }).then(jsonDB => {
            let oldPage = jsonDB[this.pageTag]
            if (oldPage == this.newPage) {
                console.log('无变化')
            } else {
                console.log('有变化')
                this.setDB(this.pageTag, this.newPage)
                axios.get(`https://bark.alrcly.com/${this.barkID}/${this.title}?url=${this.url}`)
                axios(`https://oapi.dingtalk.com/robot/send?access_token=f483aa47d03d8eccf0ded6ddebe77f81795613578859123d8c544e6805197116`, {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        'msgtype': 'link',
                        'link': {
                            "title": `(吃瓜) ${this.title}`,
                            "text": '这是必填字段',
                            "messageUrl": `${this.url}`
                        }
                    })
                })
            }
        }).catch(error => {
            if (error.code = 'ENOENT') {
                this.setDB(this.pageTag, this.newPage)
                axios.get(`https://bark.alrcly.com/${this.barkID}/${this.title}?url=${this.url}`)
                axios(`https://oapi.dingtalk.com/robot/send?access_token=f483aa47d03d8eccf0ded6ddebe77f81795613578859123d8c544e6805197116`, {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        'msgtype': 'link',
                        'link': {
                            "title": `(吃瓜) ${this.title}`,
                            "text": '这是必填字段',
                            "messageUrl": `${this.url}`
                        }
                    })
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