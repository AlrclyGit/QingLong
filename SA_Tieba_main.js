/**
 * @new Env("俊介：百度贴吧签到")
 * @cron 0 4 * * * SA_Tieba_main.js
*/

const axios = require("axios")
const md5 = require("blueimp-md5")
class Run {

    constructor() {
        // 获取用户所有关注贴吧
        this.LIKE_URL = "https://tieba.baidu.com/mo/q/newmoindex";
        // 获取用户的 Tab
        this.TBS_URL = "http://tieba.baidu.com/dc/common/tbs";
        // 贴吧签到接口
        this.SIGN_URL = "http://c.tieba.baidu.com/c/c/forum/sign";
        // 存储用户所关注的贴吧
        this.follow = [];
        // 签到成功的贴吧列表 
        this.success = [];
        // 用户所关注的贴吧数量
        this.followNum = 0;
        // 登录令牌
        this.BDUSS = process.env.BDUSS
    }


    getTbs() {
        axios.get(this.TBS_URL, {
            headers: {
                cookie: this.BDUSS
            }
        }).then((res) => {
            if (res.data.is_login === 1) {
                console.log('获取密钥成功')
                this.tbs = res.data.tbs
                this.getFollow()
            } else {
                console.log(`获取密钥失败 -- ${res.data}`)
                axios.get(`https://bark.alrcly.com/${barkID}/获取 tbs 失败`)
            }
        })
    }

    getFollow() {
        axios.get(this.LIKE_URL, {
            headers: {
                cookie: this.BDUSS
            }
        }).then((res) => {
            console.log(`获取贴吧列表成功`)
            let jsonArray = res.data.data.like_forum
            this.followNum = jsonArray.length
            jsonArray.forEach(element => {
                if (element.is_sign === 0) {
                    this.follow.push(element.forum_name.replace("+", "%2B"))
                } else {
                    this.success.push(element.forum_name)
                }
            });
            console.log(`需要签到的贴吧：${this.follow}`)
            console.log(`已经签到的贴吧：${this.success ? this.success : '空'}`)
            this.runSign()
        })
    }

    runSign() {
        let flag = 5
        while (this.success.length < this.followNum && flag > 0) {
            console.log(`-----第 ${5 - flag + 1} 轮签到开始-----`)
            console.log(`还剩 ${this.followNum - this.success.length} 个贴吧需要签到`)
            this.follow.forEach(element => {
                let rotation = element.replace("%2B", "+");
                let sign = md5(`kw=${rotation}tbs=${this.tbs}tiebaclient!!!`)
                axios.get(this.SIGN_URL, {
                    headers: {
                        cookie: this.BDUSS
                    },
                    params: {
                        kw: element,
                        tbs: this.tbs,
                        sign: sign
                    }
                }).then((res) => {
                    if (res.data.error_code == 0) {
                        this.success.push(rotation);
                        console.log(`「${rotation}」签到成功`);
                        if (this.follow == []) {
                            console.log('完成所有贴吧签到')
                        }
                    } else {
                        console.log(res.data)
                        console.log(`「${rotation}」签到失败`);
                        axios.get(`https://bark.alrcly.com/${barkID}/「${rotation}」签到失败`)
                    }
                })
            })
            flag--
        }
    }
}


new Run().getTbs()

