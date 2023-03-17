/**
 * @new Env("阿里云盘签到")
 * @cron 0 6 * * * SA_Aliyun_main.js
*/


const updateAccesssTokenURL = "https://auth.aliyundrive.com/v2/account/token"
const signinURL = "https://member.aliyundrive.com/v1/activity/sign_in_list"
const refreshToeknArry = [process.env.aliyunID]


const axios = require("axios")

!(async () => {
    for (const elem of refreshToeknArry) {
        // 
        const queryBody = {
            'grant_type': 'refresh_token',
            'refresh_token': elem
        };
        //使用 refresh_token 更新 access_token
        axios(updateAccesssTokenURL, {
            method: "POST",
            data: JSON.stringify(queryBody),
            headers: { 'Content-Type': 'application/json' }
        }).then((res) => {
            let access_token = res.data.access_token;
            console.log(access_token)
            //签到
            axios(signinURL, {
                method: "POST",
                data: JSON.stringify(queryBody),
                headers: { 'Authorization': 'Bearer ' + access_token, 'Content-Type': 'application/json' }
            }).then((json) => {
                if (json.data.success == true) {
                    console.log('完成签到');
                } else {
                    console.log(json.data);
                }
            }).catch((err) => {
                console.log(err)
            })
        }).catch((err) => {
            console.log(err)
        })
    }
})().catch((e) => {
    console.error(`❗️  运行错误！\n${e}`)
}).finally()

