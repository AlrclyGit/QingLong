/**
 * @new Env("俊介：阿里云盘签到")
 * @cron 0 6 * * * SA_Aliyun_main.js
*/

const axios = require("axios")

class Run {

    /**
     * 设置属性 
     */
    constructor() {
        this.refreshToeknArry = [process.env.aliyunID]
        this.updateAccesssTokenURL = "https://auth.aliyundrive.com/v2/account/token"
        this.signinURL = "https://member.aliyundrive.com/v1/activity/sign_in_list"
        this.barkID = process.env.barkID
    }

    /**
     * 主函数 
     */
    main() {
        this.getToken()
    }

    /**
     * 获取 accessToken
     */
    getToken() {
        for (const elem of this.refreshToeknArry) {
            this.queryBody = {
                'grant_type': 'refresh_token',
                'refresh_token': elem
            };
            axios(this.updateAccesssTokenURL, {
                method: "POST",
                data: JSON.stringify(this.queryBody),
                headers: { 'Content-Type': 'application/json' }
            }).then((res) => {
                if (res.data.status == "enabled") {
                    this.access_token = res.data.access_token;
                    console.log(`获取 access_token 成功`)
                    this.signIn()
                } else {
                    console.log(json.data);
                    axios.get(`https://bark.alrcly.com/${this.barkID}/阿里云盘签到失败 A`)
                }
            })
        }
    }

    /** 
     * 签到
     */
    signIn() {
        axios(this.signinURL, {
            method: "POST",
            data: JSON.stringify(this.queryBody),
            headers: {
                'Authorization': `Bearer ${this.access_token}`,
                'Content-Type': 'application/json'
            }
        }).then((res) => {
            if (res.data.success == true) {
                console.log('完成阿里云盘签到');
            } else {
                console.log(res.data);
                axios.get(`https://bark.alrcly.com/${this.barkID}/阿里云盘签到失败 B`)
            }
        })
    }
}

new Run().main()