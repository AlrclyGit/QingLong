/**
 * 任务名称
 * name: 俊介：百度贴吧签到
 * 定时规则
 * cron: 1 15 * * *
 */

//
const axios = require('axios');
const md5 = require('blueimp-md5');

// 获取用户的 Tab
const TBS_URL = 'http://tieba.baidu.com/dc/common/tbs';
// 获取用户所有关注贴吧
const LIKE_URL = 'https://tieba.baidu.com/mo/q/newmoindex';
// 贴吧签到接口
const SIGN_URL = 'http://c.tieba.baidu.com/c/c/forum/sign';
// 登录令牌
const tiebaCookie = process.env.BAIDUTBS;

// 未签到的贴吧列表
let notSignIn = [];
// 签到成功的贴吧列表
let successSignIn = [];
// 用户所关注的贴吧数量
let signInNum = 0;
// 登录密钥
let tbs;

async function signInToTieba() {
  try {
    const res = await axios.get(TBS_URL, {
      headers: {
        cookie: tiebaCookie,
      },
    });

    if (res.data.is_login === 1) {
      console.log('获取密钥成功');
      tbs = res.data.tbs;

      const likeRes = await axios.get(LIKE_URL, {
        headers: {
          cookie: tiebaCookie,
        },
      });

      console.log(`获取贴吧列表成功`);
      let likeForum = likeRes.data.data.like_forum;
      signInNum = likeForum.length;

      likeForum.forEach((element) => {
        if (element.is_sign === 0) {
          notSignIn.push(element.forum_name.replace('+', '%2B'));
        } else {
          successSignIn.push(element.forum_name);
        }
      });

      console.log(`需要签到的贴吧：${notSignIn}`);
      console.log(`已经签到的贴吧：${successSignIn}`);
      console.log(`还剩 ${signInNum - successSignIn.length} 个贴吧需要签到`);

      if (notSignIn.length !== 0) {
        console.log(`-----签到开始-----`);

        for (let i = 0; i < notSignIn.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 12345)); // 等待指定时间

          let rotation = notSignIn[i].replace('%2B', '+');
          let sign = md5(`kw=${rotation}tbs=${tbs}tiebaclient!!!`);
          console.log(`「${rotation}」签到开始`);

          try {
            const signRes = await axios.get(SIGN_URL, {
              headers: {
                cookie: tiebaCookie,
              },
              params: {
                kw: notSignIn[i],
                tbs: tbs,
                sign: sign,
              },
            });

            if (signRes.data.error_code == 0) {
              successSignIn.push(rotation);
              console.log(`「${rotation}」签到成功`);
              if (successSignIn.length == signInNum) console.log(`-----签到结束-----`);
            } else {
              console.log(signRes);
              console.log(`「${rotation}」签到失败`);
              QLAPI.notify('百度贴吧签到', `「${rotation}」签到失败`);
            }
          } catch (error) {
            console.error(`❗️  运行错误！\n${error}`);
            QLAPI.notify('百度贴吧签到', '百度贴吧签到运行错误！');
          }
        }
      }
    } else {
      console.log('获取密钥失败');
      QLAPI.notify('百度贴吧签到', '获取 tbs 失败');
    }
  } catch (error) {
    console.error(`❗️  获取数据失败！\n${error}`);
    QLAPI.notify('百度贴吧签到', '获取数据失败！');
  }
}

// 调用函数
signInToTieba();
