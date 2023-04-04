/**
 * @new Env("俊介：阿里云盘签到")
 * @cron 1 3 * * * SA_Aliyun_main.js
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
        for (const elem of this.refreshToeknArry) {
            this.queryBody = {
                'grant_type': 'refresh_token',
                'refresh_token': elem
            };
            axios(this.updateAccesssTokenURL, {
                method: "POST",
                data: JSON.stringify(this.queryBody),
                headers: { 'Content-Type': 'application/json' }
            }).then(res => {
                if (res.data.status == "enabled") {
                    let access_token = res.data.access_token;
                    console.log(`获取 access_token 成功`)
                    return axios(this.signinURL, {
                        method: "POST",
                        data: JSON.stringify(this.queryBody),
                        headers: {
                            'Authorization': `Bearer ${access_token}`,
                            'Content-Type': 'application/json'
                        }
                    })
                } else {
                    console.log(json.data);
                    axios.get(`https://bark.alrcly.com/${this.barkID}/阿里云盘获取密钥失败`)
                    process.exit()
                }
            }).then(res => {
                if (res.data.success == true) {
                    console.log('完成阿里云盘签到');
                } else {
                    console.log(res.data);
                    axios.get(`https://bark.alrcly.com/${this.barkID}/阿里云盘签到失败`)
                    process.exit()
                }
            }).catch(error => {
                console.log(error);
                axios.get(`https://bark.alrcly.com/${this.barkID}/阿里云盘网络请求到失败`)
            })
        }
    }
}


new Run().main()