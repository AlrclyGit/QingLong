/**
 * @new Env("俊介：阿里云盘签到")
 * @cron 0 3  * * * SA_Aliyun_main.js
*/

const axios = require("axios")

class Run {

    /**
     * 设置属性 
     */
    constructor() {
        this.refreshToKen = process.env.aliyunID
        this.accesssTokenURL = "https://auth.aliyundrive.com/v2/account/token"
        this.signinURL = "https://member.aliyundrive.com/v1/activity/sign_in_list"
        this.barkID = process.env.barkID
    }

    /**
     * 主函数 
     */
    async main() {
        this.queryBody = {
            'grant_type': 'refresh_token',
            'refresh_token': this.refreshToken
        };
        const updateAccesssTokenRes = await axios(this.accesssTokenURL, {
            method: "POST",
            data: JSON.stringify(this.queryBody),
            headers: { 'Content-Type': 'application/json' }
        })
        if (updateAccesssTokenRes.data.status == "enabled") {
            let access_token = updateAccesssTokenRes.data.access_token;
            console.log(`获取 access_token 成功`)
            const signinRes = await axios(this.signinURL, {
                method: "POST",
                data: JSON.stringify(this.queryBody),
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            })
            if (signinRes.data.success == true) {
                console.log('完成阿里云盘签到');
            } else {
                console.log(res.data);
                axios.get(`https://bark.alrcly.com/${this.barkID}/阿里云盘签到失败`)
                process.exit()
            }
        } else {
            console.log(json.data);
            axios.get(`https://bark.alrcly.com/${this.barkID}/阿里云盘获取密钥失败`)
            process.exit()
        }
    }

}


new Run().main()