/**
 * @new Env("俊介：百度贴吧签到")
 * @cron 1 4 * * * SA_Tieba_main.js
*/

const axios = require("axios")
const md5 = require("blueimp-md5")

class Run {

    /** 
     * 设置属性
     */
    constructor() {
        // 获取用户所有关注贴吧
        this.LIKE_URL = "https://tieba.baidu.com/mo/q/newmoindex"
        // 获取用户的 Tab
        this.TBS_URL = "http://tieba.baidu.com/dc/common/tbs"
        // 贴吧签到接口
        this.SIGN_URL = "http://c.tieba.baidu.com/c/c/forum/sign"
        // 未签到的贴吧列表
        this.notSignIn = []
        // 签到成功的贴吧列表 
        this.successSignIn = []
        // 用户所关注的贴吧数量
        this.signInNum = 0
        // 登录令牌
        this.tiebaCookie = process.env.tieBa
        // barkID
        this.barkID = process.env.barkID
    }

    /** 
     * 主函数
     */
    main() {
        axios.get(this.TBS_URL, {
            headers: {
                cookie: this.tiebaCookie
            }
        }).then(res => {
            if (res.data.is_login === 1) {
                console.log('获取密钥成功')
                this.tbs = res.data.tbs
                return axios.get(this.LIKE_URL, {
                    headers: {
                        cookie: this.tiebaCookie
                    }
                })
            } else {
                console.log(`获取密钥失败 -- ${res}`)
                axios.get(`https://bark.alrcly.com/${this.barkID}/获取 tbs 失败`)
                process.exit()
            }
        }).then(res => {
            console.log(`获取贴吧列表成功`)
            let likeForum = res.data.data.like_forum
            this.signInNum = likeForum.length
            likeForum.forEach(element => {
                if (element.is_sign === 0) {
                    this.notSignIn.push(element.forum_name.replace("+", "%2B"))
                } else {
                    this.successSignIn.push(element.forum_name)
                }
            })
            console.log(`需要签到的贴吧：${this.notSignIn}`)
            console.log(`已经签到的贴吧：${this.successSignIn}`)
            console.log(`还剩 ${this.signInNum - this.successSignIn.length} 个贴吧需要签到`)
            if (this.notSignIn.length != 0) {
                console.log(`-----签到开始-----`)
                for (let i = 0; i < this.notSignIn.length; i++) {
                    setTimeout(() => {
                        let rotation = this.notSignIn[i].replace("%2B", "+")
                        let sign = md5(`kw=${rotation}tbs=${this.tbs}tiebaclient!!!`)
                        console.log(`「${rotation}」签到开始`)
                        axios.get(this.SIGN_URL, {
                            headers: {
                                cookie: this.tiebaCookie
                            },
                            params: {
                                kw: this.notSignIn[i],
                                tbs: this.tbs,
                                sign: sign
                            }
                        }).then((res) => {
                            if (res.data.error_code == 0) {
                                this.successSignIn.push(rotation)
                                console.log(`「${rotation}」签到成功`)
                                if (this.successSignIn.length == this.signInNum) console.log(`-----签到结束-----`)
                            } else {
                                console.log(res)
                                console.log(`「${rotation.data}」签到失败`)
                                axios.get(`https://bark.alrcly.com/${this.barkID}/「${rotation}」签到失败`)
                            }
                        }).catch((e) => {
                            console.error(`❗️  运行错误！\n${e}`)
                            axios.get(`https://bark.alrcly.com/${this.barkID}/百度贴吧签到运行错误！`)
                        })
                    }, 12345 * i)
                }
            }
        })
    }
}

new Run().main()

